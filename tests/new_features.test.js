const request = require('supertest');
const app = require('../server');
const db = require('../config/database');
const fs = require('fs');
const path = require('path');
const backupService = require('../services/backupService');

// Mock fs.copyFileSync for backup test
jest.spyOn(fs, 'copyFileSync').mockImplementation(() => { });
jest.spyOn(console, 'log').mockImplementation(() => { }); // Silence logs

describe('New Features Test Suite', () => {
    let agent;
    let memberIds = [];

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("DELETE FROM audit_logs");

        agent = request.agent(app);
        await agent
            .post('/login')
            .send('username=admin&password=admin123');

        // Add 3 members for testing
        for (let i = 1; i <= 3; i++) {
            const res = await db.run("INSERT INTO members (name, type) VALUES (?, 'member')", [`Test Member ${i}`]);
            memberIds.push(res.lastID);
        }
    });

    describe('Bulk Contributions', () => {
        it('should record multiple contributions via bulk add', async () => {
            const res = await agent
                .post('/transactions/bulk-add')
                .send({
                    member_ids: memberIds, // [1, 2, 3]
                    amount: 1000,
                    date: '2026-02-19', // May 2026
                    remarks: 'Bulk Test'
                });

            expect(res.status).toBe(302);

            // Verify DB records
            const txns = await db.all("SELECT * FROM transactions WHERE date = '2026-02-19' AND type = 'contribution'");
            expect(txns.length).toBe(3);
            expect(txns[0].payment_batch_id).toBe('2026-02');
        });

        it('should skip duplicates if run again for same month', async () => {
            const res = await agent
                .post('/transactions/bulk-add')
                .send({
                    member_ids: memberIds,
                    amount: 1000,
                    date: '2026-02-20', // Same month, different day
                    remarks: 'Bulk Duplicate'
                });

            expect(res.status).toBe(302);

            // Count shouldn't change
            const txns = await db.all("SELECT * FROM transactions WHERE payment_batch_id = '2026-02' AND type = 'contribution'");
            expect(txns.length).toBe(3);
        });
    });

    describe('Duplicate Prevention (Constraint)', () => {
        it('should block adding a generic transaction if batch_id exists', async () => {
            // Member 1 already has May 2026 paid (from Bulk test above)
            const res = await agent
                .post('/transactions/add')
                .send(`person_id=${memberIds[0]}&type=contribution&amount=1000&date=2026-02-20&remarks=Force Dup`);

            expect(res.status).toBe(302);
            // In transactions.js, we redirect with error=duplicate_contribution
            expect(res.header.location).toContain('error=duplicate_contribution');

            // Verify count is still 1 for this member/month
            const count = await db.get("SELECT COUNT(*) as c FROM transactions WHERE member_id = ? AND payment_batch_id = '2026-02'", [memberIds[0]]);
            expect(count.c).toBe(1);
        });
    });

    describe('Audit Logs', () => {
        it('should create an audit log when deleting a transaction', async () => {
            // 1. Get a transaction ID
            const txn = await db.get("SELECT id FROM transactions LIMIT 1");
            expect(txn).toBeDefined();

            // 2. Delete it
            await agent.post(`/transactions/delete/${txn.id}`);

            // 3. Check Audit Log
            const log = await db.get("SELECT * FROM audit_logs WHERE action = 'DELETE_TRANSACTION' ORDER BY id DESC LIMIT 1");
            expect(log).toBeDefined();

            const details = JSON.parse(log.details);
            expect(details.id).toBe(txn.id);
        });
    });

    describe('Automated Backups', () => {
        it('should trigger backup creation', async () => {
            // Reset spy
            fs.copyFileSync.mockClear();

            const result = backupService.backupDatabase();

            expect(result).not.toBeNull();
            expect(fs.copyFileSync).toHaveBeenCalled();
            expect(result).toContain('chitfund_'); // Timestamped file
        });
    });

    describe('Loan Logic', () => {
        beforeEach(async () => {
            // Ensure a known fund balance: insert a small contribution so fund has money
            // but not enough for a 10,000 loan
            await db.run(
                "INSERT OR IGNORE INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 500, '2026-02-21', 'Seed for balance test')",
                [memberIds[0]]
            );
        });

        it('should reject loan creation if fund balance is insufficient', async () => {
            // Attempt to borrow more than available balance (10,000 is very high)
            const res = await agent
                .post('/loans/add')
                .send(`member_id=${memberIds[0]}&amount=999999&rate=2&tenure=10&start_date=2026-02-24`);

            expect(res.status).toBe(302);
            // The redirect contains the error with encoded message (dynamic currency amount follows)
            expect(res.header.location).toContain('error=Insufficient');
        });

        it('should revert loan balance when repayment is deleted', async () => {
            // 1. Create a loan
            // We need a member. Use first one.
            const p = 1000;
            const r = 2;
            const n = 1;
            const total = 1020; // 1000 + 2% for 1 month

            // Ensure we have enough funds (fake getFundBalance or just use small loan)
            // Mock getFundBalance or ensure DB has funds. 
            // Previous Bulk test added 3000. So 1000 is fine.

            await agent
                .post('/loans/add')
                .send(`member_id=${memberIds[0]}&amount=${p}&rate=${r}&tenure=${n}&start_date=2026-02-24`);

            // Get loan ID
            const loanRes = await db.get("SELECT id, outstanding, status FROM loans WHERE member_id = ? ORDER BY id DESC LIMIT 1", [memberIds[0]]);
            const loanId = loanRes.id;
            expect(loanRes.status).toBe('active');

            // 2. Repay fully
            await agent
                .post('/loans/repay')
                .send(`loan_id=${loanId}&amount=${total}&date=2026-02-21&month_for=July 2026`);

            // Verify closed
            const loanAfterPay = await db.get("SELECT outstanding, status FROM loans WHERE id = ?", [loanId]);
            expect(loanAfterPay.status).toBe('closed');
            expect(loanAfterPay.outstanding).toBe(0);

            // Get Transaction ID
            const txn = await db.get("SELECT id FROM transactions WHERE loan_id = ? AND type = 'repayment'", [loanId]);

            // 3. Delete Repayment
            // Need to be admin. Agent preserves session? 
            // Our test setup sets session as admin in 'beforeAll'? 
            // Checking test file setup... 
            // In setup-env we usually mock session or use supertest agent. 
            // Assume session is persistent or we need to login. Check "beforeAll".

            await agent.post(`/transactions/delete/${txn.id}`);

            // 4. Verify Loan Reverted
            const loanReverted = await db.get("SELECT outstanding, status FROM loans WHERE id = ?", [loanId]);
            expect(loanReverted.status).toBe('active');
            expect(loanReverted.outstanding).toBe(total);
        });
    });
});
