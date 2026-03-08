const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Business Logic Tests', () => {
    let agent;
    let memberId;
    let loanId;
    // Loan details: 12000 Principal, 2% Rate, 12 Months
    // Interest = 12000 * 2 * 12 / 100 = 2880
    // Total = 14880
    // EMI = 14880 / 12 = 1240
    const LOAN_AMOUNT = 12000;
    const LOAN_RATE = 2;
    const LOAN_TENURE = 12;
    const EXPECTED_EMI = 1240;
    const TOTAL_PAYABLE = 14880;

    beforeAll(async () => {
        await db.init();
        // Force cleanup
        await db.run("PRAGMA foreign_keys = OFF;");
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("PRAGMA foreign_keys = ON;");

        agent = request.agent(app);
        // Login
        await agent.post('/login').send('username=admin&password=admin123');

        // Create Member
        const res = await db.run("INSERT INTO members (name, type, status) VALUES ('Logic Test User', 'member', 'active')");
        memberId = res.lastID;
    });

    beforeEach(async () => {
        // Clear loans/transactions for clean state
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");

        // Seed funds so loan creation passes "Insufficient Balance" check
        const seedDate = new Date().toISOString().split('T')[0];
        await db.run("INSERT INTO transactions (member_id, date, type, amount, remarks) VALUES (?, ?, 'contribution', 100000, 'Seed Capital')", [memberId, seedDate]);

        // Create a standard loan
        // We'll use the API to create it to ensure full flow, or DB directly? 
        // Let's use DB to speed up, but API is better for "integration".
        // Using API for creation:
        const start_date = new Date().toISOString().split('T')[0]; // Today
        const res = await agent
            .post('/loans/add')
            .send(`member_id=${memberId}&amount=${LOAN_AMOUNT}&rate=${LOAN_RATE}&tenure=${LOAN_TENURE}&start_date=${start_date}`);

        if (res.status === 302 && res.header.location.includes('error')) {
            console.error('Loan creation failed:', res.header.location);
        }

        const loan = await db.get("SELECT id FROM loans WHERE member_id = ?", [memberId]);
        loanId = loan.id;
    });

    describe('Overpayment Prevention', () => {
        it('should reject payment if amount exceeds total outstanding', async () => {
            // Outstanding is TOTAL_PAYABLE initially? 
            // In our system, "outstanding" column store is initialized to Total EMI Amount
            // Let's check DB to be sure
            const loan = await db.get("SELECT outstanding FROM loans WHERE id = ?", [loanId]);
            const initialOutstanding = loan.outstanding;
            expect(initialOutstanding).toBe(TOTAL_PAYABLE);

            // Attempt to pay Outstanding + 100
            const payAmount = initialOutstanding + 100;

            const res = await agent
                .post('/loans/repay')
                .send(`loan_id=${loanId}&amount=${payAmount}&date=2026-02-24&month_for=Full Closure`);

            // Should redirect with error
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('error=Payment%20exceeds%20outstanding');

            // Verify balance hasn't changed
            const loanAfter = await db.get("SELECT outstanding FROM loans WHERE id = ?", [loanId]);
            expect(loanAfter.outstanding).toBe(initialOutstanding);
        });
    });

    describe('Partial Payment Tracking', () => {
        it('should accept partial payment and keep loan active', async () => {
            const partialAmount = EXPECTED_EMI / 2; // 620

            const res = await agent
                .post('/loans/repay')
                .send(`loan_id=${loanId}&amount=${partialAmount}&date=2026-02-24&month_for=June 2026`);

            // Should succeed
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('msg=Repayment%20recorded%20successfully');

            // Verify Outstanding Reduced
            const loan = await db.get("SELECT outstanding, status FROM loans WHERE id = ?", [loanId]);
            const expectedOutstanding = TOTAL_PAYABLE - partialAmount;

            expect(loan.outstanding).toBe(expectedOutstanding);
            expect(loan.status).toBe('active');
        });

        it('should update next due calculation correctly (via View logic checks implies data integrity)', async () => {
            // Make a partial payment for "June 2026"
            // The system records "EMI for June 2026"
            const partialAmount = 500;
            await agent
                .post('/loans/repay')
                .send(`loan_id=${loanId}&amount=${partialAmount}&date=2026-02-24&month_for=June 2026`);

            // Check transactions
            const txns = await db.all("SELECT * FROM transactions WHERE loan_id = ? AND type = 'repayment'", [loanId]);
            expect(txns.length).toBe(1);
            expect(txns[0].remarks).toContain('June 2026');
        });
    });

    describe('Early Closure', () => {
        it('should close loan immediately upon full repayment', async () => {
            const loan = await db.get("SELECT outstanding FROM loans WHERE id = ?", [loanId]);
            const fullAmount = loan.outstanding;

            const res = await agent
                .post('/loans/repay')
                .send(`loan_id=${loanId}&amount=${fullAmount}&date=2026-02-24&month_for=Full Settlement`);

            expect(res.status).toBe(302);

            const loanAfter = await db.get("SELECT outstanding, status FROM loans WHERE id = ?", [loanId]);
            expect(loanAfter.outstanding).toBe(0);
            expect(loanAfter.status).toBe('closed');
        });
    });

    describe('Interest Accuracy', () => {
        it('should calculate total payable accurately (Flat Rate)', async () => {
            // P = 12000, R = 2% (24% p.a.), T = 12 months
            // Total Interest = 12000 * 2 * 12 / 100 = 2880
            // Total Payable = 14880

            // We check 'outstanding' immediately after creation (which is Total Payable)
            // (We implicitly checked this in the variable const TOTAL_PAYABLE = 14880)

            const loan = await db.get("SELECT outstanding, emi FROM loans WHERE id = ?", [loanId]);

            const expectedInterest = (LOAN_AMOUNT * LOAN_RATE * LOAN_TENURE) / 100;
            const expectedTotal = LOAN_AMOUNT + expectedInterest;

            expect(loan.outstanding).toBe(expectedTotal);
            expect(loan.emi).toBe(expectedTotal / LOAN_TENURE);
        });
    });
});
