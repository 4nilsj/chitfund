const request = require('supertest');
const app = require('../server');
const db = require('../config/database');

describe('Delete and Move Operations', () => {
    let agent;
    let memberId, loanId, txnId;

    beforeAll(async () => {
        await db.init();
        agent = request.agent(app);
        await agent.post('/login').send('username=admin&password=admin123');

        // Setup Test Data
        await db.run("INSERT INTO members (name, type, status) VALUES ('Delete Me', 'member', 'active')");
        const m = await db.get("SELECT id FROM members WHERE name = 'Delete Me'");
        memberId = m.id;

        await db.run("INSERT INTO loans (member_id, amount, status) VALUES (?, 1000, 'active')", [memberId]);
        const l = await db.get("SELECT id FROM loans WHERE member_id = ?", [memberId]);
        loanId = l.id;

        await db.run("INSERT INTO transactions (member_id, amount, type) VALUES (?, 100, 'expense')", [memberId]);
        const t = await db.get("SELECT id FROM transactions WHERE member_id = ?", [memberId]);
        txnId = t.id;
    });

    it('should delete transaction via POST', async () => {
        const res = await agent.post(`/transactions/delete/${txnId}`);
        expect(res.status).toBe(302);
        const check = await db.get("SELECT * FROM transactions WHERE id = ?", [txnId]);
        expect(check).toBeUndefined();
    });

    it('should delete loan via POST', async () => {
        const res = await agent.post(`/loans/delete/${loanId}`);
        expect(res.status).toBe(302);
        const check = await db.get("SELECT * FROM loans WHERE id = ?", [loanId]);
        expect(check).toBeUndefined();
    });

    it('should move member via POST', async () => {
        // Re-insert member if needed or just use existing
        const res = await agent.post('/members/move-to-public').send({ member_id: memberId });
        expect(res.status).toBe(302);
        const check = await db.get("SELECT type FROM members WHERE id = ?", [memberId]);
        expect(check.type).toBe('public');
    });

    it('should delete member via POST', async () => {
        const res = await agent.post(`/members/delete/${memberId}`);
        expect(res.status).toBe(302);
        const check = await db.get("SELECT * FROM members WHERE id = ?", [memberId]);
        expect(check).toBeUndefined();
    });
});
