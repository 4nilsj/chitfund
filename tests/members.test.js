const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Members Module', () => {
    let agent;

    beforeAll(async () => {
        await db.init();
        // Force cleanup ignoring constraints
        await db.run("PRAGMA foreign_keys = OFF;");
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("PRAGMA foreign_keys = ON;");
        agent = request.agent(app);
        // Login as admin for all member tests
        await agent
            .post('/login')
            .send('username=admin&password=admin123');
    });

    it('should list members successfully', async () => {
        const res = await agent.get('/members?type=member');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Members');
    });

    it('should add a new member successfully', async () => {
        const res = await agent
            .post('/members/add')
            .send('name=John Doe&contact=9876543210&type=member');

        expect(res.status).toBe(302);
        expect(res.header.location).toContain('/members?type=member');
        expect(res.header.location).toContain('msg=Member%20added%20successfully');

        const member = await db.get("SELECT * FROM members WHERE name = 'John Doe'");
        expect(member).toBeDefined();
        expect(member.contact).toBe('9876543210');
    });

    it('should prevent duplicate members (name + contact)', async () => {
        // First one added in previous test
        const res = await agent
            .post('/members/add')
            .send('name=John Doe&contact=9876543210&type=member');

        expect(res.status).toBe(302);
        expect(res.header.location).toContain('msg=Member%20already%20exists');
    });

    it('should list public contributors successfully', async () => {
        const res = await agent.get('/members?type=public');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Public Contributors');
    });

    it('should add a new public contributor successfully', async () => {
        const res = await agent
            .post('/members/add')
            .send('name=Jane Smith&contact=9876543210&type=public');

        expect(res.status).toBe(302);
        expect(res.header.location).toContain('/members?type=public');

        const contributor = await db.get("SELECT * FROM members WHERE name = 'Jane Smith' AND type = 'public'");
        expect(contributor).toBeDefined();
    });
});
