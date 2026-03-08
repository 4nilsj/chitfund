const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Auth Module', () => {
    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
    });

    it('should redirect to login if not authenticated', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(302);
        expect(res.header.location).toBe('/login');
    });

    it('should show login page', async () => {
        const res = await request(app).get('/login');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Login');
    });

    it('should login successfully with default admin credentials', async () => {
        const res = await request(app)
            .post('/login')
            .send('username=admin&password=admin123');

        expect(res.status).toBe(302);
        expect(res.header.location).toBe('/');
    });

    it('should fail login with wrong credentials', async () => {
        const res = await request(app)
            .post('/login')
            .send('username=admin&password=wrongpassword');

        expect(res.status).toBe(200); // Renders login with error
        expect(res.text).toContain('Invalid credentials');
    });

    it('should logout correctly', async () => {
        const res = await request(app).get('/logout');
        expect(res.status).toBe(302);
        expect(res.header.location).toBe('/login');
    });
});
