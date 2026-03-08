const request = require('supertest');
const app = require('../server');
const db = require('../config/database'); // Use correct path

describe('Settings Module', () => {
    let agent;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);
        // Login as admin
        await agent
            .post('/login')
            .send('username=admin&password=admin123');
    });

    it('should deny access to non-admins', async () => {
        const userAgent = request.agent(app);
        // Login as member
        await userAgent.post('/login').send('username=member&password=member123'); // Assuming member user exists

        const res = await userAgent.get('/settings');
        // Expect 403 or redirect to dashboard with error?
        // Let's assume standard behavior: 403 Forbidden
        if (res.status === 302) {
            // Maybe it redirects?
            expect(res.header.location).not.toContain('/settings');
        } else {
            expect(res.status).toBe(403);
        }
    });

    it('should show settings page for admin', async () => {
        const res = await agent.get('/settings');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Control Center');
    });

    it('should update fund name successfully', async () => {
        const newName = "New Chit Fund 2024";
        const res = await agent
            .post('/settings/update-fund-name')
            .send({ fund_name: newName });

        // Should redirect back to settings
        // Expect 200 or 302 depending on impl (Likely 302 redirect)
        if (res.status === 404) {
            throw new Error("Route not found! The functionality is missing.");
        }
        expect(res.status).toBe(302);

        // Verify DB update
        const setting = await db.get("SELECT value FROM settings WHERE key = 'fund_name'");
        expect(setting).toBeDefined();
        expect(setting.value).toBe(newName);
    });

    it('should support legacy admin route for fund name', async () => {
        const legacyName = "Legacy Fund Name";
        const res = await agent
            .post('/admin/settings/fund-name')
            .send({ fund_name: legacyName });

        expect(res.status).toBe(302);

        const setting = await db.get("SELECT value FROM settings WHERE key = 'fund_name'");
        expect(setting.value).toBe(legacyName);
    });

    it('should set opening balance successfully', async () => {
        const balance = 50000;
        const res = await agent
            .post('/settings/opening-balance')
            .send({ amount: balance });

        expect(res.status).toBe(302);

        const setting = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
        expect(parseInt(setting.value)).toBe(balance);
    });
});
