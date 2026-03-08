const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Admin Module', () => {
    let agent;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);
        // Login as admin
        await agent
            .post('/login')
            .send('username=admin&password=admin123');

        // Seed some data to delete
        await db.run("INSERT INTO members (name, type) VALUES ('Test Member', 'member')");
        await db.run("INSERT INTO loans (amount, status) VALUES (1000, 'active')");
    });

    it('should reset the fund successfully', async () => {
        // Verify data exists
        let members = await db.all("SELECT * FROM members");
        expect(members.length).toBeGreaterThan(0);

        const res = await agent.post('/admin/reset');
        expect(res.status).toBe(302);

        // Verify tables are empty
        members = await db.all("SELECT * FROM members");
        const loans = await db.all("SELECT * FROM loans");
        const transactions = await db.all("SELECT * FROM transactions");

        expect(members.length).toBe(0);
        expect(loans.length).toBe(0);
        expect(transactions.length).toBe(0);
    });

    it('should re-seed fund name after reset', async () => {
        const setting = await db.get("SELECT value FROM settings WHERE key = 'fund_name'");
        expect(setting).toBeDefined();
        expect(setting.value).toBe('ChitFund Manager');
    });
});
