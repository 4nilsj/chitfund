const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('User Management Module', () => {
    let adminAgent, managerAgent;

    beforeAll(async () => {
        await db.init();

        // Setup Agents
        adminAgent = request.agent(app);
        await adminAgent.post('/login').send('username=admin&password=admin123');

        managerAgent = request.agent(app);
        await managerAgent.post('/login').send('username=manager&password=manager123');
    });

    it('should allow admin to view users list', async () => {
        const res = await adminAgent.get('/users');
        expect(res.status).toBe(200);
        expect(res.text).toContain('User Management');
    });

    it('should DENY manager from viewing users list', async () => {
        const res = await managerAgent.get('/users');
        expect(res.status).toBe(403);
    });

    it('should allow admin to create a new user', async () => {
        const res = await adminAgent.post('/users/add').send({
            username: 'test_user',
            password: 'password123',
            role: 'manager'
        });
        expect(res.status).toBe(302);

        const user = await db.get("SELECT * FROM users WHERE username = 'test_user'");
        expect(user).toBeDefined();
        expect(user.role).toBe('manager');
    });

    it('should allow admin to delete a user', async () => {
        const user = await db.get("SELECT id FROM users WHERE username = 'test_user'");
        const res = await adminAgent.post(`/users/delete/${user.id}`);
        expect(res.status).toBe(302);

        const check = await db.get("SELECT * FROM users WHERE id = ?", [user.id]);
        expect(check).toBeUndefined();
    });
});
