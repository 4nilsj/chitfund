const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Loans Module', () => {
    let agent;
    let memberId;

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        agent = request.agent(app);
        await agent
            .post('/login')
            .send('username=admin&password=admin123');

        // Add a member
        const m = await db.run("INSERT INTO members (name, type) VALUES (?, ?)", ['Test Member', 'member']);
        memberId = m.lastID;

        // Seed funds
        const seedDate = new Date().toISOString().split('T')[0];
        await db.run("INSERT INTO transactions (member_id, date, type, amount, remarks) VALUES (?, ?, 'contribution', 1000000, 'Seed')", [memberId, seedDate]);
    });

    it('should list loans successfully', async () => {
        const res = await agent.get('/loans');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Active Loans');
    });

    it('should create a loan and calculate EMI correctly (Flat Rate)', async () => {
        const amount = 100000;
        const rate = 2; // 2% per month
        const tenure = 12; // 12 months

        // Expected Total Interest = 100000 * (2/100) * 12 = 24000
        // Expected Total Payable = 124000
        // Expected EMI = 124000 / 12 = 10333.33
        const expectedEmi = 10333;

        const res = await agent
            .post('/loans/add')
            .send(`member_id=${memberId}&amount=${amount}&rate=${rate}&tenure=${tenure}&start_date=2024-01-01`);

        expect(res.status).toBe(302);
        expect(res.header.location).toBe('/loans');

        const loan = await db.get("SELECT * FROM loans WHERE member_id = ?", [memberId]);
        expect(loan).toBeDefined();
        expect(loan.amount).toBe(amount);
        expect(loan.emi).toBe(expectedEmi);
        expect(loan.outstanding).toBe(expectedEmi * tenure); // Start with Total Payable as outstanding

        // Disbursement transaction should exist
        const txn = await db.get("SELECT * FROM transactions WHERE member_id = ? AND type = 'disbursement'", [memberId]);
        expect(txn).toBeDefined();
        expect(txn.amount).toBe(amount);
    });

    it('should show loan repayment modal values', async () => {
        const res = await agent.get('/loans');
        expect(res.text).toContain('Pay');
    });

    it('should create a loan with manual EMI override successfully', async () => {
        const amount = 50000;
        const manualEmi = 5000; // Overriding calculated EMI

        const res = await agent
            .post('/loans/add')
            .send(`member_id=${memberId}&amount=${amount}&rate=2&tenure=12&start_date=2024-02-01&manual_emi=${manualEmi}`);

        expect(res.status).toBe(302);

        const loan = await db.get("SELECT * FROM loans WHERE member_id = ? ORDER BY id DESC LIMIT 1", [memberId]);
        expect(loan).toBeDefined();
        expect(loan.emi).toBe(manualEmi);
    });
});
