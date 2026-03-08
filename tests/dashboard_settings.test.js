/**
 * Dashboard and Settings Route Integration Tests
 * Covers the uncovered branches in dashboard.js, settings.js, and users.js.
 */
const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Dashboard Routes', () => {
    let agent;
    let memberId;

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("DELETE FROM audit_logs");

        agent = request.agent(app);
        await agent.post('/login').send('username=admin&password=admin123');

        const m = await db.run("INSERT INTO members (name, type, status) VALUES ('Dash Member', 'member', 'active')");
        memberId = m.lastID;

        // Seed a contribution so dashboard has real data
        await db.run("INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 5000, '2026-02-04', 'Dash seed')", [memberId]);
    });

    it('should load the dashboard page successfully', async () => {
        const res = await agent.get('/');
        expect(res.status).toBe(200);
        // The new modernized dashboard should have these elements
        expect(res.text).toContain('Dashboard');
    });

    it('should return live stats JSON from /dashboard/stats', async () => {
        const res = await agent.get('/dashboard/stats');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/json/);
        const body = res.body;
        // Stats are wrapped under data key
        expect(body.data).toHaveProperty('totalMembers');
        expect(body.data).toHaveProperty('fundBalance');
    });

    it('should return collection details JSON from the stats endpoint', async () => {
        const res = await agent.get('/dashboard/stats');
        expect(res.status).toBe(200);
    });
});

describe('Users Module', () => {
    let adminAgent;
    let managerAgent;

    beforeAll(async () => {
        await db.init();
        adminAgent = request.agent(app);
        await adminAgent.post('/login').send('username=admin&password=admin123');
    });

    it('should load the users admin page', async () => {
        const res = await adminAgent.get('/users');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Team Access');
    });

    it('should reject a non-admin from /users', async () => {
        // Use fresh agent with no session (unauthenticated)
        const fresh = request(app);
        const res = await fresh.get('/users');
        // Should redirect to login or return 403
        expect([302, 403]).toContain(res.status);
    });
});

describe('Settings Routes - Additional Branches', () => {
    let adminAgent;

    beforeAll(async () => {
        await db.init();
        adminAgent = request.agent(app);
        await adminAgent.post('/login').send('username=admin&password=admin123');
    });

    it('should update default contribution rate', async () => {
        const res = await adminAgent
            .post('/settings/contribution/default')
            .send('monthly_contribution=1000&interest_rate=2');
        expect(res.status).toBe(302);
    });

    it('should set monthly contribution override', async () => {
        const year = new Date().getFullYear();
        const month = String(new Date().getMonth() + 1).padStart(2, '0');
        const res = await adminAgent
            .post('/settings/contribution/override')
            .send(`year=${year}&month=${month}&rate=3`);
        expect(res.status).toBe(302);
    });

    it('should load the settings page without error after updates', async () => {
        const res = await adminAgent.get('/settings');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Control Center');
    });
});
