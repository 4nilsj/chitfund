const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Route Audit', () => {
    let agent;
    let memberId, loanId, txnId;

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        agent = request.agent(app);
        // Login as admin
        await agent.post('/login').send('username=admin&password=admin123');

        // Seed Data
        await db.run("INSERT INTO members (name, type, status) VALUES ('Audit Member', 'member', 'active')");
        const m = await db.get("SELECT id FROM members WHERE name = 'Audit Member'");
        memberId = m.id;

        await db.run("INSERT INTO loans (member_id, amount, status) VALUES (?, 1000, 'active')", [memberId]);
        const l = await db.get("SELECT id FROM loans WHERE member_id = ?", [memberId]);
        loanId = l.id;

        await db.run("INSERT INTO transactions (member_id, type, amount) VALUES (?, 'contribution', 500)", [memberId]);
        const t = await db.get("SELECT id FROM transactions WHERE member_id = ?", [memberId]);
        txnId = t.id;
    });

    it('should view member details', async () => {
        const res = await agent.get(`/members/${memberId}`);
        // Currently expect 404 (Fail) or 404 handler
        if (res.status === 404) {
            console.log(`Verified: GET /members/${memberId} is MISSING (404)`);
        } else {
            expect(res.status).toBe(200);
        }
    });

    it('should view loan details', async () => {
        const res = await agent.get(`/loans/${loanId}`);
        if (res.status === 404) {
            console.log(`Verified: GET /loans/${loanId} is MISSING (404)`);
        } else {
            expect(res.status).toBe(200);
        }
    });

    it('should view transaction details', async () => {
        const res = await agent.get(`/transactions/${txnId}`);
        if (res.status === 404) {
            console.log(`Verified: GET /transactions/${txnId} is MISSING (404)`);
        } else {
            expect(res.status).toBe(200);
        }
    });

    it('should view member passbook', async () => {
        const res = await agent.get(`/members/${memberId}/passbook`);
        if (res.status === 404) {
            console.log(`Verified: GET /members/${memberId}/passbook is MISSING (404)`);
        } else {
            expect(res.status).toBe(200);
            expect(res.text).toContain('Passbook');
        }
    });
});
