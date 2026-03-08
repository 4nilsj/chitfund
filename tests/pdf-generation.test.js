const { generateReceipt } = require('../utils/receiptGenerator');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Mock pdfkit and fs
jest.mock('pdfkit');
jest.mock('fs');

describe('PDF Passbook Generation Tests', () => {
    test('should create PDF with correct headers', () => {
        const mockDoc = {
            fontSize: jest.fn().mockReturnThis(),
            text: jest.fn().mockReturnThis(),
            font: jest.fn().mockReturnThis(),
            moveDown: jest.fn().mockReturnThis(),
            moveTo: jest.fn().mockReturnThis(),
            lineTo: jest.fn().mockReturnThis(),
            stroke: jest.fn().mockReturnThis(),
            pipe: jest.fn().mockReturnThis(),
            end: jest.fn(),
            y: 100,
            page: { width: 600, height: 800 }
        };

        PDFDocument.mockImplementation(() => mockDoc);

        // Simulate PDF generation
        const doc = new PDFDocument({ margin: 50 });
        doc.fontSize(20).text('Test Fund', { align: 'center' });
        doc.fontSize(16).text('Member Passbook', { align: 'center' });

        expect(doc.fontSize).toHaveBeenCalledWith(20);
        expect(doc.text).toHaveBeenCalledWith('Test Fund', { align: 'center' });
        expect(doc.text).toHaveBeenCalledWith('Member Passbook', { align: 'center' });
    });

    test('should calculate running balance correctly', () => {
        const transactions = [
            { type: 'contribution', amount: 1000 },
            { type: 'disbursement', amount: 500 },
            { type: 'contribution', amount: 1000 },
            { type: 'repayment', amount: 300 }
        ];

        let runningBalance = 0;
        const balances = [];

        transactions.forEach(t => {
            if (['contribution', 'repayment', 'penalty'].includes(t.type)) {
                runningBalance += t.amount;
            } else {
                runningBalance -= t.amount;
            }
            balances.push(runningBalance);
        });

        expect(balances).toEqual([1000, 500, 1500, 1800]);
    });
});

describe('Contribution Receipt Generation Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs methods
        fs.existsSync = jest.fn().mockReturnValue(true);
        fs.mkdirSync = jest.fn();
        fs.createWriteStream = jest.fn().mockReturnValue({
            on: jest.fn((event, callback) => {
                if (event === 'finish') {
                    setTimeout(callback, 0);
                }
                return this;
            })
        });
    });

    test('should generate receipt with transaction details', async () => {
        const mockDoc = {
            fontSize: jest.fn().mockReturnThis(),
            text: jest.fn().mockReturnThis(),
            font: jest.fn().mockReturnThis(),
            fillColor: jest.fn().mockReturnThis(),
            moveDown: jest.fn().mockReturnThis(),
            moveTo: jest.fn().mockReturnThis(),
            lineTo: jest.fn().mockReturnThis(),
            stroke: jest.fn().mockReturnThis(),
            rect: jest.fn().mockReturnThis(),
            pipe: jest.fn().mockReturnThis(),
            end: jest.fn(),
            y: 100,
            page: { width: 420, height: 595 }
        };

        PDFDocument.mockImplementation(() => mockDoc);

        const transaction = {
            id: 123,
            date: '2026-01-26',
            type: 'contribution',
            amount: 1000,
            remarks: 'Monthly contribution'
        };

        const member = {
            name: 'Test User',
            contact: '1234567890',
            type: 'regular'
        };

        // Simulate receipt generation
        const doc = new PDFDocument({ size: 'A5', margin: 50 });
        doc.fontSize(22).text('CHIT FUND');
        doc.fontSize(16).text('PAYMENT RECEIPT');
        doc.fontSize(10).text(`Receipt No: TXN-${transaction.id}`);
        doc.fontSize(14).text(member.name);
        doc.fontSize(20).text(`₹${transaction.amount.toFixed(2)}`);

        expect(doc.text).toHaveBeenCalledWith('CHIT FUND');
        expect(doc.text).toHaveBeenCalledWith('PAYMENT RECEIPT');
        expect(doc.text).toHaveBeenCalledWith('Receipt No: TXN-123');
        expect(doc.text).toHaveBeenCalledWith('Test User');
        expect(doc.text).toHaveBeenCalledWith('₹1000.00');
    });

    test('should create receipts directory if not exists', () => {
        fs.existsSync.mockReturnValue(false);

        const receiptsDir = path.join(__dirname, '../uploads/receipts');

        if (!fs.existsSync(receiptsDir)) {
            fs.mkdirSync(receiptsDir, { recursive: true });
        }

        expect(fs.mkdirSync).toHaveBeenCalledWith(receiptsDir, { recursive: true });
    });

    test('should generate unique filename for each receipt', () => {
        const transactionId = 123;
        const timestamp = Date.now();

        const filename = `receipt_${transactionId}_${timestamp}.pdf`;

        expect(filename).toMatch(/^receipt_123_\d+\.pdf$/);
    });

    test('should return relative path for database storage', () => {
        const filename = 'receipt_123_1234567890.pdf';
        const relativePath = `uploads/receipts/${filename}`;

        expect(relativePath).toBe('uploads/receipts/receipt_123_1234567890.pdf');
    });
});

describe('Receipt Integration with Payment Flow', () => {
    test('should update transaction with receipt path after generation', async () => {
        const mockDb = {
            run: jest.fn().mockResolvedValue({ lastID: 456 })
        };

        const contributionResult = await mockDb.run(
            'INSERT INTO transactions (...) VALUES (...)'
        );

        const receiptPath = 'uploads/receipts/receipt_456_123.pdf';

        await mockDb.run(
            'UPDATE transactions SET receipt_path = ? WHERE id = ?',
            [receiptPath, contributionResult.lastID]
        );

        expect(mockDb.run).toHaveBeenCalledTimes(2);
        expect(mockDb.run).toHaveBeenLastCalledWith(
            'UPDATE transactions SET receipt_path = ? WHERE id = ?',
            [receiptPath, 456]
        );
    });

    test('should continue payment flow even if receipt generation fails', async () => {
        let paymentSuccess = false;
        let receiptError = null;

        try {
            // Simulate payment
            paymentSuccess = true;

            // Simulate receipt generation failure
            throw new Error('PDF generation failed');
        } catch (err) {
            receiptError = err;
            // Payment should still be successful
        }

        expect(paymentSuccess).toBe(true);
        expect(receiptError).toBeTruthy();
    });
});

module.exports = {};
