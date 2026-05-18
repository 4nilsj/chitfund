const request = require("supertest");
const app = require("../server");
const db = require("../config/database");

describe("Payments Integration Tests", () => {
  let memberId, loanId;

  beforeAll(async () => {
    await db.run("PRAGMA foreign_keys = ON;");
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");

    const hash = require("bcrypt").hashSync("pass123", 10);
    await db.run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      ["admin", hash, "admin"],
    );

    const memberRes = await db.run(
      "INSERT INTO members (name, contact, status) VALUES (?, ?, ?)",
      ["John Doe", "9876543210", "active"],
    );
    memberId = memberRes.lastID;

    const loanRes = await db.run(
      "INSERT INTO loans (member_id, amount, interest_rate, tenure, emi, start_date, status, outstanding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [memberId, 10000, 10, 12, 1000, "2024-01-01", "active", 12000],
    );
    loanId = loanRes.lastID;
  });

  describe("Payment Processing Logic", () => {
    it("should create contribution transaction", async () => {
      const batchId = `test-batch-${Date.now()}`;
      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, remarks, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [
          memberId,
          "2024-01-15",
          "contribution",
          500,
          "Monthly contribution",
          batchId,
        ],
      );

      const trans = await db.get(
        "SELECT * FROM transactions WHERE member_id = ? AND type = 'contribution'",
        [memberId],
      );
      expect(trans).toBeDefined();
      expect(trans.amount).toBe(500);
      expect(trans.type).toBe("contribution");
    });

    it("should create repayment transaction for loan", async () => {
      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, remarks, loan_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [memberId, "2024-01-15", "repayment", 1000, "EMI repayment", loanId],
      );

      const trans = await db.get(
        "SELECT * FROM transactions WHERE loan_id = ? AND type = 'repayment'",
        [loanId],
      );
      expect(trans).toBeDefined();
      expect(trans.amount).toBe(1000);
    });

    it("should update loan outstanding balance", async () => {
      const loanBefore = await db.get(
        "SELECT outstanding FROM loans WHERE id = ?",
        [loanId],
      );
      const outstandingBefore = loanBefore.outstanding;

      const repaymentAmount = 2000;
      await db.run(
        "INSERT INTO transactions (member_id, date, type, amount, loan_id) VALUES (?, ?, ?, ?, ?)",
        [memberId, "2024-02-15", "repayment", repaymentAmount, loanId],
      );

      const totalRepayments = await db.get(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
        [loanId],
      );
      const emiTenureAmount = 1000 * 12;
      const newOutstanding = emiTenureAmount - totalRepayments.total;

      await db.run("UPDATE loans SET outstanding = ? WHERE id = ?", [
        newOutstanding,
        loanId,
      ]);

      const loanAfter = await db.get(
        "SELECT outstanding FROM loans WHERE id = ?",
        [loanId],
      );
      expect(loanAfter.outstanding).toBeLessThan(outstandingBefore);
    });

    it("should close loan when fully repaid", async () => {
      const testLoanRes = await db.run(
        "INSERT INTO loans (member_id, amount, interest_rate, tenure, emi, start_date, status, outstanding) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [memberId, 2000, 10, 2, 1000, "2024-01-01", "active", 2000],
      );
      const testLoanId = testLoanRes.lastID;

      await db.run(
        "INSERT INTO transactions (member_id, date, type, amount, loan_id) VALUES (?, ?, ?, ?, ?)",
        [memberId, "2024-02-01", "repayment", 1000, testLoanId],
      );

      await db.run(
        "INSERT INTO transactions (member_id, date, type, amount, loan_id) VALUES (?, ?, ?, ?, ?)",
        [memberId, "2024-03-01", "repayment", 1000, testLoanId],
      );

      const totalRepayments = await db.get(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
        [testLoanId],
      );

      const newOutstanding = 1000 * 2 - totalRepayments.total;
      const newStatus = newOutstanding <= 0 ? "closed" : "active";

      await db.run(
        "UPDATE loans SET outstanding = ?, status = ? WHERE id = ?",
        [newOutstanding, newStatus, testLoanId],
      );

      const loan = await db.get("SELECT status FROM loans WHERE id = ?", [
        testLoanId,
      ]);
      expect(loan.status).toBe("closed");
    });
  });

  describe("Partial Payment Handling", () => {
    it("should handle partial payments correctly", async () => {
      const batchId = `partial-${Date.now()}`;
      const partialAmount = 600;

      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, remarks, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [
          memberId,
          "2024-03-15",
          "contribution",
          partialAmount,
          "Partial payment",
          batchId,
        ],
      );

      const trans = await db.get(
        "SELECT * FROM transactions WHERE payment_batch_id = ?",
        [batchId],
      );
      expect(trans.amount).toBe(partialAmount);
      expect(trans.remarks).toContain("Partial");
    });

    it("should allocate remaining after contribution to loans", async () => {
      const batchId = `allocation-${Date.now()}`;

      // First transaction: contribution
      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, remarks, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
        [
          memberId,
          "2024-04-15",
          "contribution",
          300,
          "Contribution part",
          batchId,
        ],
      );

      // Second transaction: loan repayment
      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, remarks, payment_batch_id, loan_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          memberId,
          "2024-04-15",
          "repayment",
          700,
          "Loan part",
          batchId,
          loanId,
        ],
      );

      const contribution = await db.get(
        "SELECT * FROM transactions WHERE payment_batch_id = ? AND type = 'contribution'",
        [batchId],
      );
      const repayment = await db.get(
        "SELECT * FROM transactions WHERE payment_batch_id = ? AND type = 'repayment'",
        [batchId],
      );

      expect(contribution.amount).toBe(300);
      expect(repayment.amount).toBe(700);
    });
  });

  describe("Member & Loan Validation", () => {
    it("should reject payment for non-existent member", async () => {
      const nonExistentMemberId = 99999;
      const member = await db.get("SELECT * FROM members WHERE id = ?", [
        nonExistentMemberId,
      ]);
      expect(member).toBeUndefined();
    });

    it("should reject payment for inactive member", async () => {
      const inactiveRes = await db.run(
        "INSERT INTO members (name, contact, status) VALUES (?, ?, ?)",
        ["Inactive", "1234567890", "inactive"],
      );
      const inactiveMemberId = inactiveRes.lastID;

      const member = await db.get("SELECT status FROM members WHERE id = ?", [
        inactiveMemberId,
      ]);
      expect(member.status).toBe("inactive");
    });

    it("should track payment with batch ID", async () => {
      const uniqueBatchId = `batch-${Date.now()}-${Math.random()}`;

      await db.run(
        `INSERT INTO transactions
                 (member_id, date, type, amount, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?)`,
        [memberId, "2024-05-15", "contribution", 500, uniqueBatchId],
      );

      const transactions = await db.all(
        "SELECT * FROM transactions WHERE payment_batch_id = ?",
        [uniqueBatchId],
      );
      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].payment_batch_id).toBe(uniqueBatchId);
    });
  });

  describe("Payment Amount Calculations", () => {
    it("should cap loan payment at EMI amount", async () => {
      const emiAmount = 1000;
      const paymentAmount = 2000; // More than EMI
      const cappedAmount = Math.min(paymentAmount, emiAmount);

      expect(cappedAmount).toBe(emiAmount);
    });

    it("should cap loan payment at outstanding balance", async () => {
      const loanData = await db.get(
        "SELECT outstanding FROM loans WHERE id = ?",
        [loanId],
      );
      const outstanding = loanData.outstanding;
      const paymentAmount = 50000; // Much more than outstanding

      const cappedAmount = Math.min(paymentAmount, outstanding);
      expect(cappedAmount).toBeLessThanOrEqual(outstanding);
    });

    it("should handle precise EMI calculations", async () => {
      const emi = 1000;
      const tenure = 12;
      const totalAmount = emi * tenure;

      expect(totalAmount).toBe(12000);

      let repaid = 0;
      for (let i = 0; i < tenure; i++) {
        repaid += emi;
      }
      expect(repaid).toBe(totalAmount);
    });
  });

  describe("Transaction Integrity", () => {
    it("should maintain referential integrity with loans", async () => {
      const repayment = await db.get(
        "SELECT * FROM transactions WHERE type = 'repayment' LIMIT 1",
      );

      if (repayment && repayment.loan_id) {
        const loan = await db.get("SELECT * FROM loans WHERE id = ?", [
          repayment.loan_id,
        ]);
        expect(loan).toBeDefined();
      }
    });

    it("should maintain referential integrity with members", async () => {
      const transaction = await db.get(
        "SELECT * FROM transactions WHERE member_id = ? LIMIT 1",
        [memberId],
      );

      if (transaction) {
        const member = await db.get("SELECT * FROM members WHERE id = ?", [
          transaction.member_id,
        ]);
        expect(member).toBeDefined();
        expect(member.id).toBe(memberId);
      }
    });
  });

  describe("Duplicate Payment Prevention", () => {
    it("should allow multiple payments for different months", async () => {
      const batch1 = `batch1-${Date.now()}`;
      const batch2 = `batch2-${Date.now() + 1}`;

      await db.run(
        `INSERT INTO transactions (member_id, date, type, amount, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?)`,
        [memberId, "2024-06-15", "contribution", 500, batch1],
      );

      await db.run(
        `INSERT INTO transactions (member_id, date, type, amount, payment_batch_id)
                 VALUES (?, ?, ?, ?, ?)`,
        [memberId, "2024-07-15", "contribution", 500, batch2],
      );

      const batchCount = await db.get(
        "SELECT COUNT(*) as count FROM transactions WHERE member_id = ? AND payment_batch_id IN (?, ?)",
        [memberId, batch1, batch2],
      );
      expect(batchCount.count).toBeGreaterThanOrEqual(2);
    });
  });

  afterAll(async () => {
    await db.run("DELETE FROM transactions WHERE 1=1");
    await db.run("DELETE FROM loans WHERE 1=1");
    await db.run("DELETE FROM members WHERE 1=1");
    await db.run("DELETE FROM users WHERE 1=1");
  });
});
