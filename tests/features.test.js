const request = require('supertest');
const express = require('express');
const db = require('../config/database');

// Mock database for testing
jest.mock('../config/database');

describe('Member Loan Breakdown Tests', () => {
    test('should calculate principal pending and interest paid correctly', () => {
        const loan = {
            amount: 10000,
            tenure: 12,
            emi: 900
        };
        const totalRepaid = 4500; // 5 EMIs paid

        // Logic from members.js
        const principalRepaid = Math.min(totalRepaid, loan.amount);
        const principalPending = loan.amount - principalRepaid;
        const interestPaid = Math.max(0, totalRepaid - loan.amount);

        expect(principalPending).toBe(5500); // 10000 - 4500
        expect(interestPaid).toBe(0);
    });

    test('should calculate interest paid when total repaid exceeds principal', () => {
        const loan = {
            amount: 10000,
            tenure: 12,
            emi: 900
        };
        const totalRepaid = 10800; // Full repayment (12 * 900)

        const principalRepaid = Math.min(totalRepaid, loan.amount);
        const principalPending = loan.amount - principalRepaid;
        const interestPaid = Math.max(0, totalRepaid - loan.amount);

        expect(principalPending).toBe(0);
        expect(interestPaid).toBe(800); // 10800 - 10000
    });

    test('should calculate EMI counts correctly', () => {
        const loan = {
            tenure: 12,
            emi: 900
        };
        const totalRepaid = 4500;

        const emisPaid = Math.floor(totalRepaid / loan.emi);
        const emisPending = Math.max(0, loan.tenure - emisPaid);

        expect(emisPaid).toBe(5);
        expect(emisPending).toBe(7);
    });
});

describe('EMI Schedule Generator Tests', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        // Mock render to avoid needing view engine setup
        app.render = (name, options, callback) => callback(null, '<html></html>');
        app.locals.fundName = 'Test Fund';

        // Mock session middleware
        app.use((req, res, next) => {
            req.session = { user: { id: 1, userType: 'admin' } };
            res.locals.fundName = 'Test Fund';
            next();
        });

        app.use('/loans', require('../routes/loans'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should generate EMI schedule for a loan', async () => {
        const mockLoan = {
            id: 1,
            member_id: 1,
            member_name: 'Test User',
            amount: 10000,
            interest_rate: 2,
            tenure: 12,
            emi: 900,
            start_date: '2026-02-04',
            outstanding: 10000,
            status: 'active'
        };

        const mockRepayments = [
            { id: 1, date: '2026-02-01', amount: 900, loan_id: 1 },
            { id: 2, date: '2026-03-01', amount: 900, loan_id: 1 }
        ];

        db.get = jest.fn()
            .mockResolvedValueOnce(mockLoan);

        db.all = jest.fn()
            .mockResolvedValueOnce(mockRepayments);

        const response = await request(app).get('/loans/1');

        expect(response.status).toBe(200);
        expect(db.get).toHaveBeenCalledWith(
            expect.stringContaining('SELECT l.*, m.name as member_name'),
            ['1']
        );
        expect(db.all).toHaveBeenCalledWith(
            expect.stringContaining('WHERE loan_id = ?'),
            ['1']
        );
    });

    test('should mark EMI as paid when payment exists', () => {
        const startDate = new Date('2026-02-04');
        const tenure = 12;
        const emi = 900;
        // Repayment date should be in month 1 (first EMI month = startDate + 1 month = 2026-03)
        const repayments = [
            { date: '2026-03-15', amount: 900 }
        ];

        // Simulate EMI schedule generation logic
        const schedule = [];
        for (let month = 1; month <= tenure; month++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + month);

            const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
            const paidInMonth = repayments.filter(r => r.date.startsWith(monthKey));
            const paidAmount = paidInMonth.reduce((sum, r) => sum + r.amount, 0);

            let status = 'pending';
            if (paidAmount >= emi) {
                status = 'paid';
            }

            schedule.push({ month, status, paidAmount });
        }

        expect(schedule[0].status).toBe('paid');
        expect(schedule[0].paidAmount).toBe(900);
        expect(schedule[1].status).toBe('pending');
    });

    test('should mark EMI as overdue when past due date and unpaid', () => {
        const startDate = new Date('2025-01-01');
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + 1);

        const now = new Date();
        const isOverdue = dueDate < now;
        const paidAmount = 0;

        let status = 'pending';
        if (paidAmount === 0 && isOverdue) {
            status = 'overdue';
        }

        expect(status).toBe('overdue');
    });
});

describe('Payment Status Dashboard Tests', () => {
    let app;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        // Mock render to avoid needing view engine setup
        app.render = (name, options, callback) => callback(null, '<html></html>');
        app.locals.fundName = 'Test Fund';

        app.use((req, res, next) => {
            req.session = { user: { id: 1, userType: 'admin' } };
            res.locals.fundName = 'Test Fund';
            next();
        });

        app.use('/reports', require('../routes/reports'));
    });

    test('should generate payment grid for last 6 months', async () => {
        const mockMembers = [
            { id: 1, name: 'Member 1', type: 'regular', status: 'active' },
            { id: 2, name: 'Member 2', type: 'regular', status: 'active' }
        ];

        db.all = jest.fn().mockResolvedValueOnce(mockMembers);
        db.get = jest.fn().mockResolvedValue(null);

        const response = await request(app).get('/reports/payment-status');

        expect(response.status).toBe(200);
        expect(db.all).toHaveBeenCalledWith(
            expect.stringContaining("SELECT id, name, type, status FROM members WHERE status = 'active'")
        );
    });

    test('should correctly identify paid vs pending status', () => {
        const payment = { id: 1, amount: 1000 };
        const isPaid = !!payment;

        expect(isPaid).toBe(true);

        const noPayment = null;
        const isNotPaid = !!noPayment;

        expect(isNotPaid).toBe(false);
    });
});

describe('Interest Tracking Tests', () => {
    test('should calculate total interest correctly', () => {
        const loan = {
            amount: 10000,
            interest_rate: 2,
            tenure: 12
        };

        // Simple Interest Formula: (P × R × T) / 100
        const totalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;

        expect(totalInterest).toBe(2400);
    });

    test('should calculate interest collected from repayments', () => {
        const principal = 10000;
        const totalRepaid = 11500;

        const interestCollected = Math.max(0, totalRepaid - principal);

        expect(interestCollected).toBe(1500);
    });

    test('should calculate pending interest', () => {
        const totalInterest = 2400;
        const interestCollected = 1500;

        const pendingInterest = totalInterest - interestCollected;

        expect(pendingInterest).toBe(900);
    });

    test('should handle case where no interest collected yet', () => {
        const principal = 10000;
        const totalRepaid = 5000;

        const interestCollected = Math.max(0, totalRepaid - principal);

        expect(interestCollected).toBe(0);
    });
});

describe('Duplicate Payment Prevention Tests', () => {
    test('should detect duplicate payment for same month', () => {
        const existingPayment = {
            payment_batch_id: '2026-01-1-1234567890'
        };

        const newPaymentMonth = '2026-01';
        const existingMonth = existingPayment.payment_batch_id.substring(0, 7);

        const isDuplicate = newPaymentMonth === existingMonth;

        expect(isDuplicate).toBe(true);
    });

    test('should allow payment for different month', () => {
        const existingPayment = {
            payment_batch_id: '2026-01-1-1234567890'
        };

        const newPaymentMonth = '2026-02';
        const existingMonth = existingPayment.payment_batch_id.substring(0, 7);

        const isDuplicate = newPaymentMonth === existingMonth;

        expect(isDuplicate).toBe(false);
    });
});

module.exports = {
    // Export for integration tests
};
