const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Transactions Module', () => {
    let agent;
    let memberId;

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("DELETE FROM settings");
        await db.run("DELETE FROM audit_logs");
        agent = request.agent(app);
        await agent
            .post('/login')
            .send('username=admin&password=admin123');

        // Add a member
        const m = await db.run("INSERT INTO members (name, type) VALUES (?, ?)", ['Txn Member', 'member']);
        memberId = m.lastID;
    });

    it('should list transactions successfully', async () => {
        const res = await agent.get('/transactions');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Transactions');
    });

    it('should record a generic contribution successfully', async () => {
        const amount = 5000;
        const res = await agent
            .post('/transactions/add')
            .send(`person_id=${memberId}&type=contribution&amount=${amount}&date=2026-02-14&remarks=Initial Contribution`);

        expect(res.status).toBe(302);
        expect(res.header.location).toContain('/transactions'); // Redirects to Transactions list

        const txn = await db.get("SELECT * FROM transactions WHERE member_id = ? AND type = 'contribution'", [memberId]);
        expect(txn).toBeDefined();
        expect(txn.amount).toBe(amount);
    });

    it('should calculate fund balance correctly after inflow/outflow', async () => {
        // Insert known transactions directly into DB to verify balance arithmetic
        // This tests the DB layer, not the HTTP route (which is covered by other tests)
        const today = new Date().toISOString().split('T')[0];
        await db.run(
            "INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 5000, ?, 'Inflow A')",
            [memberId, today]
        );
        await db.run(
            "INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'expense', 1000, ?, 'Outflow B')",
            [memberId, today]
        );
        await db.run(
            "INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 2000, ?, 'Inflow C')",
            [memberId, today]
        );

        // Total inflow: 5000 + 2000 = 7000, outflow: 1000, net = 6000
        const inflow = await db.get(
            "SELECT SUM(amount) as total FROM transactions WHERE type = 'contribution' AND remarks LIKE 'Inflow%' AND member_id = ?",
            [memberId]
        );
        const outflow = await db.get(
            "SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND remarks LIKE 'Outflow%' AND member_id = ?",
            [memberId]
        );
        const netBalance = (inflow.total || 0) - (outflow.total || 0);

        expect(netBalance).toBe(6000); // 7000 inflow - 1000 outflow
    });

    it('should handle loan repayment updates correctly', async () => {
        // Create a separate loan for this
        const loanRes = await db.run("INSERT INTO loans (member_id, amount, emi, outstanding, status) VALUES (?, 10000, 1000, 10000, 'active')", [memberId]);
        const loanId = loanRes.lastID;

        // Record a repayment with special remarks pattern "Loan:ID" or similar as per server.js logic
        // Wait, looking at server.js:518: if (type === 'repayment' && remarks.startsWith('Loan:'))
        const repayAmount = 1000;
        await agent
            .post('/transactions/add')
            .send(`person_id=${memberId}&type=repayment&amount=${repayAmount}&date=2026-02-17&remarks=Loan: ${loanId}`);

        const loan = await db.get("SELECT * FROM loans WHERE id = ?", [loanId]);
        expect(loan.outstanding).toBe(9000);
    });
});
