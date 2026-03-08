const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Cascading Loan Deletion', () => {
    let agent;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);

        // Clean up
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");

        // Login
        await agent.post('/login').send('username=admin&password=admin123');
    });

    it('should delete associated transactions when a loan is deleted', async () => {
        // 1. Create a member
        const memberRes = await db.run("INSERT INTO members (name, status) VALUES (?, ?)", ['Test Member', 'active']);
        const memberId = memberRes.lastID;

        // Seed funds
        const seedDate = new Date().toISOString().split('T')[0];
        await db.run("INSERT INTO transactions (member_id, date, type, amount, remarks) VALUES (?, ?, 'contribution', 100000, 'Seed')", [memberId, seedDate]);

        // 2. Create a loan
        const loanData = {
            member_id: memberId,
            amount: 1000,
            rate: 2,
            tenure: 12,
            start_date: '2026-01-01'
        };
        const loanRes = await agent.post('/loans/add').send(Object.entries(loanData).map(([k, v]) => `${k}=${v}`).join('&'));

        // Find the loan ID
        const loan = await db.get("SELECT id FROM loans WHERE member_id = ?", [memberId]);
        const loanId = loan.id;

        // 3. Verify disbursement transaction was created with loan_id
        const disbursement = await db.get("SELECT * FROM transactions WHERE loan_id = ? AND type = 'disbursement'", [loanId]);
        expect(disbursement).toBeDefined();
        expect(disbursement.amount).toBe(1000);

        // 4. Add a manual repayment
        const repaymentData = {
            person_id: memberId,
            type: 'repayment',
            amount: 100,
            date: '2026-01-15',
            remarks: `Loan:${loanId}`
        };
        await agent.post('/transactions/add').send(Object.entries(repaymentData).map(([k, v]) => `${k}=${v}`).join('&'));

        // 5. Verify repayment recorded with loan_id
        const repayment = await db.get("SELECT * FROM transactions WHERE loan_id = ? AND type = 'repayment'", [loanId]);
        expect(repayment).toBeDefined();
        expect(repayment.amount).toBe(100);

        // 6. Delete the loan
        await agent.post(`/loans/delete/${loanId}`);

        // 7. Verify loan and all associated transactions are gone
        const deletedLoan = await db.get("SELECT * FROM loans WHERE id = ?", [loanId]);
        expect(deletedLoan).toBeUndefined();

        const remainingTxns = await db.all("SELECT * FROM transactions WHERE loan_id = ?", [loanId]);
        expect(remainingTxns.length).toBe(0);
    });
});
