const db = require('../config/database');

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
};

const validateContact = (contact) => {
    const cleaned = String(contact).replace(/\D/g, '');
    return /^[6-9][0-9]{9}$/.test(cleaned);
};

const validateAmount = (amount, min = 1, max = 10000000) => {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= min && num <= max && num > 0;
};

const validateDate = (date, maxPastDays = 730, maxFutureDays = 1) => {
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return false;
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        const diffDays = (d - now) / (1000 * 60 * 60 * 24);
        return diffDays >= -maxPastDays && diffDays <= maxFutureDays;
    } catch { return false; }
};

const validateName = (name) => {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    return /^[a-zA-Z\s\.\-]{2,100}$/.test(trimmed) && trimmed.length >= 2;
};

const validateInteger = (value, min = 1, max = Number.MAX_SAFE_INTEGER) => {
    const num = parseInt(value);
    return Number.isInteger(num) && num >= min && num <= max;
};

const validatePercentage = (value, min = 0.1, max = 100) => {
    const num = parseFloat(value);
    return !isNaN(num) && num >= min && num <= max;
};

const sanitizeString = (str, maxLength = 500) => {
    if (!str) return '';
    return String(str).trim().slice(0, maxLength);
};

async function calculateMonthlyObligation(memberId, month) {
    try {
        // Get member type to determine if they contribute
        const member = await db.get("SELECT type FROM members WHERE id = ?", [memberId]);
        const isPublic = member && member.type === 'public';

        // Fetch dynamic contribution settings (only for members, not public)
        let contributionAmount = 0;

        if (!isPublic) {
            // 1. Check for specific month override
            const monthOverride = await db.get("SELECT value FROM settings WHERE key = ?", [`contribution_${month}`]);

            // 2. Check for global default
            const globalDefault = await db.get("SELECT value FROM settings WHERE key = 'default_contribution'");

            // Determine applicable contribution amount
            contributionAmount = 1000; // Hard fallback

            if (monthOverride) {
                contributionAmount = parseInt(monthOverride.value);
            } else if (globalDefault) {
                contributionAmount = parseInt(globalDefault.value);
            }
        }

        // Get all active loans for member
        const activeLoans = await db.all(
            "SELECT id, emi, amount, outstanding FROM loans WHERE member_id = ? AND status = 'active'",
            [memberId]
        );

        // Calculate total EMI
        const totalEMI = activeLoans.reduce((sum, loan) => sum + loan.emi, 0);

        // Check if already paid this month (check for any transaction with this month's batch ID)
        const existingPayment = await db.get(
            `SELECT payment_batch_id FROM transactions 
             WHERE member_id = ? AND payment_batch_id LIKE ? 
             LIMIT 1`,
            [memberId, `${month}-%`]
        );

        return {
            contributionAmount,
            totalEMI,
            totalDue: contributionAmount + totalEMI,
            loans: activeLoans,
            hasActiveLoans: activeLoans.length > 0,
            alreadyPaid: !!existingPayment,
            paymentBatchId: existingPayment?.payment_batch_id,
            isPublic
        };
    } catch (err) {
        console.error('Error calculating monthly obligation:', err);
        return {
            contributionAmount: 1000,
            totalEMI: 0,
            totalDue: 1000,
            loans: [],
            hasActiveLoans: false,
            alreadyPaid: false,
            isPublic: false
        };
    }
}

const calculateEMI = (principal, rate, tenure) => {
    // Simple Interest Formula
    // Total Interest = P * R * N / 100
    // Total Amount = P + Interest
    // EMI = Total / N
    const P = parseFloat(principal);
    const R = parseFloat(rate);
    const N = parseInt(tenure);

    if (isNaN(P) || isNaN(R) || isNaN(N) || N <= 0) return 0;

    const totalInterest = (P * R * N) / 100;
    const totalPayable = P + totalInterest;
    return Math.round(totalPayable / N);
};

module.exports = {
    formatCurrency,
    validateContact,
    validateAmount,
    validateDate,
    validateName,
    validateInteger,
    validatePercentage,
    sanitizeString,
    calculateMonthlyObligation,
    calculateEMI,
    getFundBalance: async () => {
        try {
            const totalContributions = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'contribution'");
            const totalRepayments = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'repayment'");
            const totalDisbursements = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'disbursement'");
            const totalExpenses = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'");

            const openingSetting = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
            const openingBalance = openingSetting ? parseInt(openingSetting.value) : 0;

            const contributions = totalContributions.total || 0;
            const repayments = totalRepayments.total || 0;
            const disbursements = totalDisbursements.total || 0;
            const expenses = totalExpenses.total || 0;

            return (contributions + repayments + openingBalance) - (disbursements + expenses);
        } catch (err) {
            console.error('Error calculating fund balance:', err);
            return 0;
        }
    },
    logAudit: async (req, action, details) => {
        try {
            const userId = req.session?.user?.id || null;
            const ip = req.ip || req.connection.remoteAddress;
            const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);

            await db.run(
                "INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)",
                [userId, action, detailsStr, ip]
            );
        } catch (err) {
            console.error('Audit Log Error:', err);
        }
    }
};
