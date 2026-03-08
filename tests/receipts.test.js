const request = require('supertest');
const db = require('../config/database');
const app = require('../server');
const fs = require('fs');
const path = require('path');

// Mock Auth Middleware
jest.mock('../middleware/auth', () => ({
    isAuthenticated: (req, res, next) => next(),
    isAdmin: (req, res, next) => next(),
    canWrite: (req, res, next) => next()
}));

describe('Receipt Generation', () => {
    let transactionId;

    beforeAll(async () => {
        await db.init();
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");

        // Create Member
        await db.run("INSERT INTO members (id, name, contact, type, status) VALUES (1, 'Receipt Tester', '9998887776', 'member', 'active')");

        // Create Transaction
        const res = await db.run("INSERT INTO transactions (member_id, date, type, amount, remarks) VALUES (1, '2025-01-01', 'contribution', 5000, 'Test Receipt')");
        transactionId = res.lastID;
    });

    afterAll(async () => {
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
    });

    test('should generate PDF receipt for valid transaction', async () => {
        const res = await request(app)
            .get(`/transactions/${transactionId}/receipt`)
            .expect(200)
            .expect('Content-Type', /pdf/);

        // Check if buffer starts with PDF signature
        expect(res.body.toString().substring(0, 4)).toBe('%PDF');
    });

    test('should return 404 for invalid transaction', async () => {
        await request(app)
            .get('/transactions/99999/receipt')
            .expect(404);
    });
});
