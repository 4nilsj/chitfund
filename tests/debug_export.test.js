const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Export Debug', () => {
    let agent;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);
        // Login as admin
        await agent.post('/login').send('username=admin&password=admin123');
    });

    it('should return correct excel headers for overall export', async () => {
        const res = await agent.get('/reports/export/overall');

        console.log('StatusCode:', res.status);
        console.log('Content-Type:', res.header['content-type']);
        console.log('Content-Disposition:', res.header['content-disposition']);
        console.log('Body Length:', res.body ? res.body.length : 'null');

        expect(res.status).toBe(200);
        expect(res.header['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        expect(res.header['content-disposition']).toContain('attachment; filename="Overall_Report.xlsx"');
    });
});
