const db = require("../config/database");
const { formatCurrency, preciseRound } = require("../utils/helpers");

async function getDashboardData(user, fundName, query = {}) {
  const userType = user.userType;
  const memberId = user.memberId;
  const isMember = userType === "member";

  // Active Members (both members and public contributors)
  const totalUsers = await db.get(
    "SELECT COUNT(*) as count FROM members WHERE status = 'active'",
  );

  // Current Fund Balance
  let fundBalance;
  if (isMember) {
    const memberContributions = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type IN ('contribution', 'repayment')",
      [memberId],
    );
    const memberDisbursements = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'disbursement'",
      [memberId],
    );
    const contributions = memberContributions.total || 0;
    const disbursements = memberDisbursements.total || 0;
    fundBalance = preciseRound(contributions - disbursements);
  } else {
    const totalContributions = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'contribution'",
    );
    const totalRepayments = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'repayment'",
    );
    const totalDisbursements = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'disbursement'",
    );
    const totalExpenses = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'",
    );
    const totalPenalties = await db.get(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'penalty'",
    );

    const openingSetting = await db.get(
      "SELECT value FROM settings WHERE key = 'opening_balance'",
    );
    const openingBalance = openingSetting ? parseInt(openingSetting.value) : 0;

    const contributions = totalContributions.total || 0;
    const repayments = totalRepayments.total || 0;
    const disbursements = totalDisbursements.total || 0;
    const expenses = totalExpenses.total || 0;
    const penalties = totalPenalties.total || 0;

    fundBalance = preciseRound(
      contributions +
        repayments +
        penalties +
        openingBalance -
        (disbursements + expenses),
    );
  }

  const openingSetting = await db.get(
    "SELECT value FROM settings WHERE key = 'opening_balance'",
  );
  const isOpeningBalanceSet = !!openingSetting;

  // ── Aggregated Interest & Outstanding Calculations (O(1) queries, no more N+1) ──
  //
  // Single query: joins each loan with the SUM of its repayments,
  // then computes interest earned and collected entirely in JS with math.
  const loanAggregates = await db.all(
    `
        SELECT
            l.id,
            l.amount,
            l.interest_rate,
            l.tenure,
            l.interest_waived,
            l.status,
            l.member_id,
            COALESCE(SUM(CASE WHEN t.type = 'repayment' THEN t.amount ELSE 0 END), 0) AS total_repaid
        FROM loans l
        LEFT JOIN transactions t ON t.loan_id = l.id
        ${isMember ? "WHERE l.member_id = ?" : ""}
        GROUP BY l.id
    `,
    isMember ? [memberId] : [],
  );

  let totalInterestEarned = 0;
  let totalInterestCollected = 0;
  let calculatedTotalOutstanding = 0;
  let calculatedPrincipalPending = 0;

  for (const loan of loanAggregates) {
    const rawTotalInterest =
      (loan.amount * loan.interest_rate * loan.tenure) / 100;
    const totalInterest = Math.max(
      0,
      rawTotalInterest - (loan.interest_waived || 0),
    );
    const totalPayable = loan.amount + totalInterest;
    const totalRepaid = loan.total_repaid;

    const interestRatio = totalPayable > 0 ? totalInterest / totalPayable : 0;
    const interestCollected = totalRepaid * interestRatio;

    totalInterestEarned += totalInterest;
    totalInterestCollected += interestCollected;

    // Only count active loans for outstanding/principal figures
    if (loan.status === "active") {
      const outstanding = Math.max(0, totalPayable - totalRepaid);
      calculatedTotalOutstanding += outstanding;

      const principalRepaid = totalRepaid * (1 - interestRatio);
      calculatedPrincipalPending += Math.max(0, loan.amount - principalRepaid);
    }
  }

  totalInterestEarned = preciseRound(totalInterestEarned);
  totalInterestCollected = preciseRound(totalInterestCollected);
  calculatedTotalOutstanding = preciseRound(calculatedTotalOutstanding);
  calculatedPrincipalPending = preciseRound(calculatedPrincipalPending);

  // Recent Transactions
  const recentTxns = isMember
    ? await db.all(
        `
            SELECT t.*, m.name as member_name 
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.id 
            WHERE t.member_id = ?
            ORDER BY t.date DESC, t.id DESC 
            LIMIT 5
        `,
        [memberId],
      )
    : await db.all(`
            SELECT t.*, m.name as member_name 
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.id 
            ORDER BY t.date DESC, t.id DESC 
            LIMIT 5
        `);

  // ── Aggregated Monthly Trends (single query instead of 12) ──
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 7);

  const trendRows = await db.all(
    `
        SELECT
            strftime('%Y-%m', date) AS month_key,
            SUM(CASE WHEN type IN ('contribution', 'repayment', 'penalty') THEN amount ELSE 0 END) AS collections,
            SUM(CASE WHEN type = 'disbursement' THEN amount ELSE 0 END) AS disbursements
        FROM transactions
        WHERE date >= ?
        ${isMember ? "AND member_id = ?" : ""}
        GROUP BY month_key
        ORDER BY month_key ASC
    `,
    isMember ? [sixMonthsAgoStr + "-01", memberId] : [sixMonthsAgoStr + "-01"],
  );

  // Build a complete 6-month array filling in 0s for months with no data
  const trendMap = {};
  for (const row of trendRows) {
    trendMap[row.month_key] = row;
  }

  const monthlyTrends = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStr = date.toISOString().slice(0, 7);
    const monthName = date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const row = trendMap[monthStr] || {};
    monthlyTrends.push({
      month: monthName,
      collections: row.collections || 0,
      disbursements: row.disbursements || 0,
    });
  }

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const txnBreakdown = isMember
    ? await db.all(
        `SELECT type, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE date LIKE ? AND member_id = ? GROUP BY type`,
        [`${currentMonth}%`, memberId],
      )
    : await db.all(
        `SELECT type, COUNT(*) as count, SUM(amount) as total FROM transactions WHERE date LIKE ? GROUP BY type`,
        [`${currentMonth}%`],
      );

  const loanStats = isMember
    ? await db.all(
        `SELECT status, COUNT(*) as count, SUM(outstanding) as total_outstanding FROM loans WHERE member_id = ? GROUP BY status`,
        [memberId],
      )
    : await db.all(
        `SELECT status, COUNT(*) as count, SUM(outstanding) as total_outstanding FROM loans GROUP BY status`,
      );

  const topContributors = await db.all(`
        SELECT m.name, SUM(t.amount) as total 
        FROM transactions t 
        JOIN members m ON t.member_id = m.id 
        WHERE t.type = 'contribution' 
        GROUP BY m.id 
        ORDER BY total DESC 
        LIMIT 5
    `);

  const inactiveCountRes = await db.get(
    "SELECT COUNT(*) as count FROM members WHERE status = 'inactive'",
  );
  const inactiveMembersCount = inactiveCountRes.count;

  const members = await db.all(
    "SELECT id, name, type FROM members WHERE status = 'active' ORDER BY name ASC",
  );

  const activeLoansRes = isMember
    ? await db.get(
        "SELECT COUNT(*) as count FROM loans WHERE status = 'active' AND member_id = ?",
        [memberId],
      )
    : await db.get(
        "SELECT COUNT(*) as count FROM loans WHERE status = 'active'",
      );

  const currentMonthTrends = monthlyTrends[5] || { collections: 0 };

  // ── Overdue Alerts (accurate SQL-based approach) ──
  let overdueContributions = [];
  let overdueEMIs = [];

  if (!isMember) {
    // 1. Members who have NOT paid contribution this month
    //    Uses LEFT JOIN to find nulls — one query replaces per-member loop
    overdueContributions = await db.all(
      `
            SELECT m.id, m.name
            FROM members m
            LEFT JOIN transactions t
                ON t.member_id = m.id
                AND t.type = 'contribution'
                AND strftime('%Y-%m', t.date) = ?
            WHERE m.status = 'active'
              AND m.type != 'public'
              AND t.id IS NULL
            ORDER BY m.name ASC
        `,
      [currentMonth],
    );

    // 2. Active loans where there is NO repayment for the current month,
    //    and the loan has been active long enough that an EMI is due this month.
    //    due_month = start_date + 1 month, compared against current month.
    overdueEMIs = await db.all(
      `
            SELECT
                l.id AS loan_id,
                l.emi,
                l.start_date,
                l.tenure,
                m.name AS member_name
            FROM loans l
            JOIN members m ON l.member_id = m.id
            LEFT JOIN transactions t
                ON t.loan_id = l.id
                AND t.type = 'repayment'
                AND strftime('%Y-%m', t.date) = ?
            WHERE l.status = 'active'
              AND t.id IS NULL
              AND strftime('%Y-%m', date(l.start_date, '+1 month')) <= ?
            ORDER BY m.name ASC
        `,
      [currentMonth, currentMonth],
    );
  }

  // Combine overdue items into upcomingPayments
  const defaultRaw = await db.get(
    "SELECT value FROM settings WHERE key = 'default_contribution'",
  );
  const defaultContribution = defaultRaw ? parseInt(defaultRaw.value) : 1000;
  const overrideRaw = await db.get("SELECT value FROM settings WHERE key = ?", [
    `contribution_${currentMonth}`,
  ]);
  const currentMonthContribution = overrideRaw
    ? parseInt(overrideRaw.value)
    : defaultContribution;

  const contributionPayments = overdueContributions.map((c) => ({
    memberName: c.name,
    dueDate: `${currentMonth}-01`,
    amount: currentMonthContribution,
    overdue: true,
    type: "contribution",
  }));

  const emiPayments = overdueEMIs.map((l) => ({
    memberName: l.member_name,
    dueDate: `${currentMonth}-15`,
    amount: l.emi,
    overdue: true,
    type: "repayment",
    loanId: l.loan_id,
  }));

  const upcomingPayments = [...contributionPayments, ...emiPayments];

  return {
    user,
    fundName,
    activePage: "dashboard",
    userType,
    isMember,
    membersCount: isMember ? 1 : totalUsers.count,
    activeLoansCount: activeLoansRes.count,
    monthlyCollectionRaw: currentMonthTrends.collections,
    monthlyCollection: formatCurrency(currentMonthTrends.collections),
    totalMembers: isMember ? 1 : totalUsers.count,
    inactiveMembersCount: isMember ? 0 : inactiveMembersCount,
    fundBalanceRaw: fundBalance,
    fundBalance: formatCurrency(fundBalance),
    outstandingRaw: calculatedPrincipalPending,
    outstanding: formatCurrency(calculatedPrincipalPending),
    totalInterestEarnedRaw: totalInterestEarned,
    totalInterestEarned: formatCurrency(totalInterestEarned),
    totalInterestCollectedRaw: totalInterestCollected,
    totalInterestCollected: formatCurrency(totalInterestCollected),
    recentTransactions: recentTxns,
    members: isMember ? [] : members,
    isOpeningBalanceSet: !!isOpeningBalanceSet,
    monthlyTrends,
    txnBreakdown,
    loanStats,
    topContributors,
    upcomingPayments,
    action: query.action || null,
    repayLoanId: query.loan_id || null,
    repayAmount: query.amount || null,
    msg: query.msg,
    type: query.type,
    error: query.error,
  };
}

module.exports = {
  getDashboardData,
};
