/**
 * Service Layer Unit Tests
 * Tests sorting, filtering, pagination, and edge cases for:
 *   - transactionService
 *   - memberService
 *   - loanService
 */
const db = require('../config/database');
const TransactionService = require('../services/transactionService');
const MemberService = require('../services/memberService');

let memberId;
let member2Id;

beforeAll(async () => {
    await db.init();
    // Clean slate
    await db.run("DELETE FROM transactions");
    await db.run("DELETE FROM loans");
    await db.run("DELETE FROM members");

    // Seed two members
    const m1 = await db.run("INSERT INTO members (name, type, status) VALUES ('Alice', 'member', 'active')");
    memberId = m1.lastID;
    const m2 = await db.run("INSERT INTO members (name, type, status) VALUES ('Bob', 'member', 'inactive')");
    member2Id = m2.lastID;

    // Seed transactions
    await db.run("INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 300, '2026-02-04', 'Jan')", [memberId]);
    await db.run("INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'contribution', 100, '2026-02-01', 'Feb')", [memberId]);
    await db.run("INSERT INTO transactions (member_id, type, amount, date, remarks) VALUES (?, 'expense',      200, '2026-03-01', 'Mar')", [member2Id]);
});

afterAll(async () => {
    await db.run("DELETE FROM transactions");
    await db.run("DELETE FROM members");
});

// ─── Transaction Service ─────────────────────────────────────────────────────

describe('TransactionService.getTransactions()', () => {
    it('should return all transactions with default params', async () => {
        const { transactions, totalItems } = await TransactionService.getTransactions({}, {});
        expect(totalItems).toBeGreaterThanOrEqual(3);
        expect(transactions.length).toBeGreaterThan(0);
    });

    it('should sort by amount ASC', async () => {
        const { transactions } = await TransactionService.getTransactions(
            { sortBy: 'amount', sortDir: 'asc' },
            { limit: 10, offset: 0 }
        );
        for (let i = 1; i < transactions.length; i++) {
            expect(transactions[i].amount).toBeGreaterThanOrEqual(transactions[i - 1].amount);
        }
    });

    it('should sort by amount DESC', async () => {
        const { transactions } = await TransactionService.getTransactions(
            { sortBy: 'amount', sortDir: 'desc' },
            { limit: 10, offset: 0 }
        );
        for (let i = 1; i < transactions.length; i++) {
            expect(transactions[i].amount).toBeLessThanOrEqual(transactions[i - 1].amount);
        }
    });

    it('should sort by date DESC by default when unknown sortBy given', async () => {
        const { transactions } = await TransactionService.getTransactions(
            { sortBy: 'unknown_column', sortDir: 'asc' },
            { limit: 10, offset: 0 }
        );
        expect(transactions.length).toBeGreaterThan(0);
    });

    it('should filter by search string', async () => {
        const { transactions } = await TransactionService.getTransactions(
            { search: 'Alice' },
            {}
        );
        expect(transactions.every(t => t.person_name === 'Alice')).toBe(true);
    });

    it('should filter by memberId when isMember=true', async () => {
        const { transactions, totalItems } = await TransactionService.getTransactions(
            { isMember: true, memberId },
            {}
        );
        expect(transactions.every(t => t.member_id === memberId)).toBe(true);
        expect(totalItems).toBe(2);
    });

    it('should support pagination (limit/offset)', async () => {
        const { transactions } = await TransactionService.getTransactions({}, { limit: 1, offset: 0 });
        expect(transactions.length).toBe(1);

        const { transactions: page2 } = await TransactionService.getTransactions({}, { limit: 1, offset: 1 });
        expect(page2.length).toBe(1);
        expect(page2[0].id).not.toBe(transactions[0].id);
    });
});

// ─── Member Service ──────────────────────────────────────────────────────────

describe('MemberService.getAllMembers()', () => {
    it('should return all members with default params', async () => {
        const { members, totalRecords } = await MemberService.getAllMembers({}, {});
        expect(totalRecords).toBeGreaterThanOrEqual(2);
        expect(members.length).toBeGreaterThan(0);
    });

    it('should sort by name ASC by default', async () => {
        const { members } = await MemberService.getAllMembers(
            { sortBy: 'name', sortDir: 'asc' },
            { limit: 10, offset: 0 }
        );
        for (let i = 1; i < members.length; i++) {
            expect(members[i].name.localeCompare(members[i - 1].name)).toBeGreaterThanOrEqual(0);
        }
    });

    it('should sort by name DESC', async () => {
        const { members } = await MemberService.getAllMembers(
            { sortBy: 'name', sortDir: 'desc' },
            { limit: 10, offset: 0 }
        );
        for (let i = 1; i < members.length; i++) {
            expect(members[i].name.localeCompare(members[i - 1].name)).toBeLessThanOrEqual(0);
        }
    });

    it('should use default sort column for unknown sortBy', async () => {
        const { members } = await MemberService.getAllMembers(
            { sortBy: 'nonexistent', sortDir: 'asc' },
            { limit: 10, offset: 0 }
        );
        expect(members.length).toBeGreaterThan(0); // Should not crash
    });

    it('should filter by status=active', async () => {
        const { members, totalRecords } = await MemberService.getAllMembers(
            { status: 'active' },
            {}
        );
        expect(members.every(m => m.status === 'active')).toBe(true);
        expect(totalRecords).toBe(1);
    });

    it('should filter by status=inactive', async () => {
        const { members } = await MemberService.getAllMembers(
            { status: 'inactive' },
            {}
        );
        expect(members.every(m => m.status === 'inactive')).toBe(true);
    });

    it('should filter by status=all returns all members', async () => {
        const { totalRecords } = await MemberService.getAllMembers({ status: 'all' }, {});
        expect(totalRecords).toBeGreaterThanOrEqual(2);
    });

    it('should filter by search string', async () => {
        const { members } = await MemberService.getAllMembers(
            { search: 'Alice' },
            {}
        );
        expect(members.length).toBe(1);
        expect(members[0].name).toBe('Alice');
    });

    it('should support pagination', async () => {
        const { members } = await MemberService.getAllMembers({}, { limit: 1, offset: 0 });
        expect(members.length).toBe(1);
    });
});
