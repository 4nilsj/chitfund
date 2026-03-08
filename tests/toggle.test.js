const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Member Status Toggle', () => {
    let agent;
    let memberId;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);
        // Login as admin
        await agent.post('/login').send('username=admin&password=admin123');

        // Create a member for toggle testing
        await db.run("INSERT INTO members (name, type, status) VALUES ('Toggle Member', 'member', 'active')");
        const m = await db.get("SELECT id FROM members WHERE name = 'Toggle Member'");
        memberId = m.id;
    });

    it('should toggle member status from active to inactive', async () => {
        const res = await agent.post('/members/status/toggle').send({
            member_id: memberId,
            status: 'inactive'
        });
        expect(res.status).toBe(302);

        const m = await db.get("SELECT status FROM members WHERE id = ?", [memberId]);
        expect(m.status).toBe('inactive');
    });

    it('should toggle member status from inactive to active', async () => {
        const res = await agent.post('/members/status/toggle').send({
            member_id: memberId,
            status: 'active'
        });
        expect(res.status).toBe(302);

        const m = await db.get("SELECT status FROM members WHERE id = ?", [memberId]);
        expect(m.status).toBe('active');
    });
});
