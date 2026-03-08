const express = require('express');
const router = express.Router();
const db = require('../config/database');
const upload = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const { isAdmin, canWrite } = require('../middleware/auth');
const {
    validateAmount,
    validateInteger,
    validatePercentage,
    sanitizeString,
    formatCurrency,
    calculateEMI,
    logAudit,
    getFundBalance
} = require('../utils/helpers');

// Loans List
router.get('/', async (req, res) => {
    try {
        const userType = req.session.user.userType;
        const memberId = req.session.user.memberId;
        const isMember = userType === 'member';

        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const offset = (page - 1) * limit;

        const sortBy = req.query.sortBy || 'id';
        const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
        const search = req.query.search || '';
        const statusFilter = req.query.status || 'all';

        let baseQuery = `
            FROM loans l 
            JOIN members m ON l.member_id = m.id 
            WHERE 1=1
        `;
        const params = [];

        if (isMember) {
            baseQuery += ` AND l.member_id = ?`;
            params.push(memberId);
        }

        if (search) {
            baseQuery += ` AND m.name LIKE ?`;
            params.push(`%${search}%`);
        }

        if (statusFilter !== 'all') {
            baseQuery += ` AND l.status = ?`;
            params.push(statusFilter);
        }

        const allowedSortColumns = {
            'id': 'l.id',
            'borrower_name': 'm.name',
            'amount': 'l.amount',
            'date': 'l.start_date',
            'status': 'l.status',
            'outstanding': 'l.outstanding'
        };

        const sortColumn = allowedSortColumns[sortBy] || 'l.id';
        const secondarySort = sortColumn === 'l.id' ? '' : ', l.id DESC';

        // COUNT total matching loans (for pagination)
        const countResult = await db.get(`SELECT COUNT(*) as total ${baseQuery}`, params);
        const totalItems = countResult.total;
        const totalPages = Math.ceil(totalItems / limit);

        const loansQuery = `
            SELECT l.*, m.name as borrower_name, m.type as borrower_type 
            ${baseQuery}
            ORDER BY ${sortColumn === 'l.id' ? `l.status = 'active' DESC, ` : ''}${sortColumn} ${sortDir} ${secondarySort}
            LIMIT ? OFFSET ?
        `;

        const loans = await db.all(loansQuery, [...params, limit, offset]);

        // Enhance loans with comprehensive payment tracking and EMI details
        const loansWithPaymentInfo = await Promise.all(loans.map(async (loan) => {
            // Get all repayments for this loan
            const repayments = await db.all(`
                SELECT * FROM transactions 
                WHERE loan_id = ? AND type = 'repayment'
                ORDER BY date DESC
            `, [loan.id]);

            // Calculate EMI details
            const totalEMIs = loan.tenure; // Total number of EMIs equals tenure in months
            const emisPaid = repayments.length;
            const pendingEMIs = Math.max(0, totalEMIs - emisPaid);

            // Calculate interest details
            const rawTotalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
            const totalInterest = Math.max(0, rawTotalInterest - (loan.interest_waived || 0));
            const totalPayable = loan.amount + totalInterest;

            // Calculate amount repaid
            const amountRepaid = repayments.reduce((sum, r) => sum + r.amount, 0);

            // Pro-rated interest calculation
            const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;
            const interestCollected = amountRepaid * interestRatio;
            const pendingInterest = Math.max(0, totalInterest - interestCollected);

            // Calculate payment months
            let lastPaidMonth = null;
            let nextDueMonth = null;

            if (repayments.length > 0) {
                // Get the most recent repayment
                const latestRepayment = repayments[0];
                lastPaidMonth = latestRepayment.remarks ? latestRepayment.remarks.replace('EMI for ', '').split(' - ')[0] : null;

                // Calculate next due month
                if (lastPaidMonth) {
                    try {
                        const [month, year] = lastPaidMonth.split(' ');
                        const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month);
                        if (monthIndex !== -1 && year) {
                            const nextMonthDate = new Date(parseInt(year), monthIndex + 1, 1);
                            const nextMonth = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][nextMonthDate.getMonth()];
                            nextDueMonth = `${nextMonth} ${nextMonthDate.getFullYear()}`;
                        }
                    } catch (e) {
                        console.error('Error calculating next due month:', e);
                    }
                }
            }

            // If nextDueMonth is still null, calculate from start date
            if (!nextDueMonth && loan.start_date) {
                try {
                    const startDate = new Date(loan.start_date);
                    if (!isNaN(startDate.getTime())) {
                        // If no payments, next due is the start month
                        // If payments exist but couldn't parse lastPaidMonth, use start month as fallback
                        const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][startDate.getMonth()];
                        nextDueMonth = `${month} ${startDate.getFullYear()}`;
                    }
                } catch (e) {
                    console.error('Error calculating next due from start date:', e);
                }
            }

            return {
                ...loan,
                // EMI tracking
                totalEMIs,
                emisPaid,
                pendingEMIs,
                // Interest details
                totalInterest,
                interestCollected,
                pendingInterest,
                totalPayable,
                // Payment tracking
                amountRepaid,
                lastPaidMonth,
                nextDueMonth,
                paymentsCount: repayments.length
            };
        }));

        // Get active members for "New Loan" modal (Legacy, now used only if someone hits /loans directly?)
        // Actually, /loans view still renders, but modal is gone.
        // We can optimize this query out later if unused, but view usage needs audit.
        // The view `loans.ejs` USES `members` for list? No, for modal only. 
        // I will keep it for now to avoid breaking render if I miss cleaning view completely.
        const members = isMember
            ? []
            : await db.all("SELECT id, name, type FROM members WHERE status = 'active' ORDER BY name ASC");

        // Calculate Summary Stats across ALL matching loans (not just current page)
        const statsRow = await db.get(`
            SELECT
                COUNT(CASE WHEN l.status = 'active' THEN 1 END) AS activeCount,
                COALESCE(SUM(l.outstanding), 0) AS totalOutstanding,
                COALESCE(SUM(l.amount), 0) AS totalDisbursed
            FROM loans l
            JOIN members m ON l.member_id = m.id
            WHERE 1=1
            ${isMember ? 'AND l.member_id = ?' : ''}
            ${search ? 'AND m.name LIKE ?' : ''}
            ${statusFilter !== 'all' ? 'AND l.status = ?' : ''}
        `, params);

        // Total interest earned is a heavier calculation — do it from current page only for display purposes
        const totalInterestOnPage = loansWithPaymentInfo.reduce((sum, l) => sum + (l.totalInterest || 0), 0);

        const stats = {
            activeCount: statsRow.activeCount || 0,
            totalOutstanding: statsRow.totalOutstanding || 0,
            totalDisbursed: statsRow.totalDisbursed || 0,
            totalInterest: totalInterestOnPage
        };

        if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.render('partials/loan_table', {
                loans: loansWithPaymentInfo,
                user: req.session.user,
                formatCurrency,
                search,
                statusFilter,
                sortBy,
                sortDir,
                totalItems,
                pagination: {
                    baseUrl: '/loans',
                    currentPage: page,
                    totalPages
                }
            });
        }

        res.render('loans', {
            user: req.session.user,
            activePage: 'loans',
            loans: loansWithPaymentInfo,
            totalItems,
            currentPage: page,
            totalPages,
            pagination: {
                baseUrl: '/loans',
                currentPage: page,
                totalPages
            },
            stats,
            members,
            search,
            statusFilter,
            sortBy,
            sortDir,
            formatCurrency,
            fundName: res.locals.fundName,
            msg: req.query.msg,
            error: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading loans");
    }
});



const { validateLoan, validateRepayment } = require('../middleware/validators');
const { validationResult } = require('express-validator');
// ... imports

// Add Loan Action
// Add Loan Action
router.post('/add', canWrite, validateLoan, async (req, res) => {
    const { member_id, amount, rate, tenure, start_date, manual_emi } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.redirect(`/loans?error=${encodeURIComponent(errors.array()[0].msg)}`);
    }

    try {
        const P = parseFloat(amount);
        const R = parseFloat(rate); // Monthly rate
        const N = parseInt(tenure);

        // Check Fund Balance
        const currentBalance = await getFundBalance();
        if (P > currentBalance) {
            return res.redirect(`/loans?error=Insufficient fund balance. Available: ${formatCurrency(currentBalance)}`);
        }

        // Calculate EMI
        let emi;
        if (manual_emi && parseFloat(manual_emi) > 0) {
            emi = parseFloat(manual_emi);
        } else {
            emi = calculateEMI(P, R, N);
        }

        // Outstanding should be total EMI amount (EMI × Tenure)
        const totalEMIAmount = emi * N;

        const params = [member_id, P, R, N, emi, start_date, totalEMIAmount];

        try {
            await db.run("BEGIN TRANSACTION");

            const loanRes = await db.run(
                `INSERT INTO loans (member_id, amount, interest_rate, tenure, emi, start_date, outstanding, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
                params
            );

            // Create Disbursement Transaction
            await db.run(
                `INSERT INTO transactions (member_id, date, type, amount, remarks, loan_id) VALUES (?, ?, 'disbursement', ?, ?, ?)`,
                [member_id, start_date || new Date().toISOString().slice(0, 10), P, `Loan Disbursement: L${loanRes.lastID}`, loanRes.lastID]
            );

            await db.run("COMMIT");

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/loans');
        } catch (txnErr) {
            await db.run("ROLLBACK");
            console.error("Transaction Error (Add Loan):", txnErr);
            res.redirect('/loans?error=Error processing loan creation');
        }

    } catch (e) {
        console.error(e);
        res.redirect('/loans?error=Server Error');
    }
});

const csrf = require('csurf');
const routeCsrf = process.env.NODE_ENV === 'test' ? (req, res, next) => next() : csrf({ cookie: false });

// Repay Loan
router.post('/repay', canWrite, upload.single('receipt'), routeCsrf, validateRepayment, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect(`/loans?error=${encodeURIComponent(errors.array()[0].msg)}`);
        }

        const { loan_id, date, month_for, amount } = req.body;
        const receiptPath = req.file ? '/uploads/' + req.file.filename : null;

        const loan = await db.get("SELECT * FROM loans WHERE id = ?", [loan_id]);
        if (!loan) return res.redirect('/loans?error=Loan not found');

        const payAmount = parseFloat(amount);

        // Check Overpayment
        if (payAmount > loan.outstanding) {
            return res.redirect(`/loans?error=Payment exceeds outstanding amount: ${formatCurrency(loan.outstanding)}`);
        }

        // Check for duplicate payment for the same month/loan
        // We check if a transaction exists for this loan with the same 'month_for' remark
        const existingRepayment = await db.get(
            `SELECT id FROM transactions 
             WHERE loan_id = ? 
             AND type = 'repayment' 
             AND remarks LIKE ?`,
            [loan_id, `EMI for ${month_for}%`]
        );

        if (existingRepayment) {
            return res.redirect(`/loans?error=EMI for ${month_for} already paid`);
        }

        try {
            await db.run("BEGIN TRANSACTION");

            // Pre-calculate Outstanding to determine if closing
            const totalEMIAmount = (loan.emi * loan.tenure) - (loan.interest_waived || 0);
            const currentTotalRepaidRes = await db.get("SELECT SUM(amount) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'", [loan_id]);
            const currentTotalRepaid = currentTotalRepaidRes.total || 0;

            const newOutstanding = totalEMIAmount - (currentTotalRepaid + payAmount);
            const newStatus = newOutstanding <= 0 ? 'closed' : 'active';

            let remarks = `EMI for ${month_for}`;
            if (newStatus === 'closed' && (loan.interest_waived || 0) > 0) {
                remarks += ` (Loan Closed. Waived off: ₹${loan.interest_waived})`;
            }

            // Record Transaction
            await db.run(
                `INSERT INTO transactions (member_id, loan_id, date, type, amount, remarks, receipt_path) 
                 VALUES (?, ?, ?, 'repayment', ?, ?, ?)`,
                [loan.member_id, loan_id, date, payAmount, remarks, receiptPath]
            );

            await db.run("UPDATE loans SET outstanding = ?, status = ? WHERE id = ?", [newOutstanding, newStatus, loan_id]);

            await db.run("COMMIT");

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/loans?msg=Repayment recorded successfully');
        } catch (txnErr) {
            await db.run("ROLLBACK");
            console.error("Transaction Error (Repayment):", txnErr);
            res.redirect('/loans?error=Error processing repayment');
        }

    } catch (err) {
        console.error(err);
        res.redirect('/loans?error=Error processing repayment');
    }
});

// View Loan Details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const loan = await db.get(`
            SELECT l.*, m.name as member_name 
            FROM loans l 
            JOIN members m ON l.member_id = m.id 
            WHERE l.id = ?
        `, [id]);

        if (!loan) return res.status(404).send("Loan not found");

        // Fetch repayments for this loan using loan_id
        const repayments = await db.all(`
            SELECT * FROM transactions 
            WHERE loan_id = ? AND type = 'repayment'
            ORDER BY date ASC
        `, [id]);

        // Generate EMI Schedule
        const emiSchedule = [];
        const startDate = new Date(loan.start_date);

        // Flat Rate Calculations
        const rawTotalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
        const totalInterest = Math.max(0, rawTotalInterest - (loan.interest_waived || 0));
        const totalPayable = loan.amount + totalInterest;
        const monthlyPrincipal = loan.amount / loan.tenure;
        const monthlyInterest = rawTotalInterest / loan.tenure;

        let runningBalance = totalPayable;

        for (let month = 1; month <= loan.tenure; month++) {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + month);
            runningBalance -= loan.emi; // Reduce balance by scheduled EMI

            // Check if this EMI was paid
            const monthKey = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}`;
            const paidInMonth = repayments.filter(r => r.date.startsWith(monthKey));
            const paidAmount = paidInMonth.reduce((sum, r) => sum + r.amount, 0);

            // Determine status
            let status = 'pending';
            if (paidAmount >= loan.emi) {
                status = 'paid';
            } else if (paidAmount > 0) {
                status = 'partial';
            } else if (dueDate < new Date()) {
                status = 'overdue';
            }

            emiSchedule.push({
                month,
                dueDate: dueDate.toISOString().split('T')[0],
                emi: loan.emi,
                principalComponent: monthlyPrincipal,
                interestComponent: monthlyInterest,
                balance: Math.max(0, runningBalance), // Ensure no negative balance
                paidAmount,
                status
            });
        }

        res.render('loan_detail', {
            user: req.session.user,
            activePage: 'loans',
            loan: loan,
            repayments: repayments,
            emiSchedule,
            formatCurrency,
            fundName: res.locals.fundName
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading loan details");
    }
});

// Delete Loan (Admin Only)
router.post('/delete/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const loan = await db.get("SELECT * FROM loans WHERE id = ?", [id]);

        try {
            await db.run("BEGIN TRANSACTION");

            // Cascading delete: Remove all transactions linked to this loan_id
            await db.run("DELETE FROM transactions WHERE loan_id = ?", [id]);
            // Remove the loan itself
            await db.run("DELETE FROM loans WHERE id = ?", [id]);

            await db.run("COMMIT");
            await logAudit(req, 'DELETE_LOAN', { id: id, member_id: loan.member_id });

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/loans?msg=Loan deleted successfully');
        } catch (txnErr) {
            await db.run("ROLLBACK");
            console.error("Transaction Error (Delete Loan):", txnErr);
            res.redirect('/loans?error=Error deleting loan');
        }

    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting loan");
    }
});

// Download Loan Schedule PDF
router.get('/:id/schedule/pdf', async (req, res) => {
    try {
        const { id } = req.params;
        const PDFDocument = require('pdfkit');

        const loan = await db.get(`
            SELECT l.*, m.name as member_name 
            FROM loans l 
            JOIN members m ON l.member_id = m.id 
            WHERE l.id = ?
        `, [id]);

        if (!loan) return res.status(404).send("Loan not found");

        // Calculations
        const rawTotalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
        const totalInterest = Math.max(0, rawTotalInterest - (loan.interest_waived || 0));
        const totalPayable = loan.amount + totalInterest;
        const monthlyPrincipal = loan.amount / loan.tenure;
        const monthlyInterest = rawTotalInterest / loan.tenure;

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Loan_${id}_Schedule.pdf"`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).text(res.locals.fundName || 'Chit Fund', { align: 'center' });
        doc.fontSize(16).text(`Repayment Schedule - Loan #${loan.id}`, { align: 'center' });
        doc.moveDown();

        // Loan Info Table
        doc.fontSize(10);
        doc.text(`Borrower: ${loan.member_name}`, 50, doc.y);
        doc.text(`Principal: ${formatCurrency(loan.amount)}`, 300, doc.y);
        doc.moveDown(0.5);
        doc.text(`Interest Rate: ${loan.interest_rate}% / month`, 50, doc.y);
        doc.text(`Total Payable: ${formatCurrency(totalPayable)}`, 300, doc.y);
        doc.moveDown(0.5);
        doc.text(`Tenure: ${loan.tenure} Months`, 50, doc.y);
        doc.text(`EMI Amount: ${formatCurrency(loan.emi)}`, 300, doc.y);
        doc.moveDown(2);

        // Schedule Table Headers
        const tableTop = doc.y;
        doc.font('Helvetica-Bold');
        const colX = { mon: 50, date: 100, emi: 200, prin: 280, int: 360, bal: 440 };

        doc.text('#', colX.mon, tableTop);
        doc.text('Due Date', colX.date, tableTop);
        doc.text('EMI', colX.emi, tableTop);
        doc.text('Principal', colX.prin, tableTop);
        doc.text('Interest', colX.int, tableTop);
        doc.text('Balance', colX.bal, tableTop);

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;
        let runningBalance = totalPayable;
        doc.font('Helvetica').fontSize(9);

        const startDate = new Date(loan.start_date);

        for (let month = 1; month <= loan.tenure; month++) {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + month);
            runningBalance -= loan.emi;

            doc.text(month.toString(), colX.mon, y);
            doc.text(dueDate.toISOString().split('T')[0], colX.date, y);
            doc.text(formatCurrency(loan.emi), colX.emi, y);
            doc.text(formatCurrency(monthlyPrincipal), colX.prin, y);
            doc.text(formatCurrency(monthlyInterest), colX.int, y);
            doc.text(formatCurrency(Math.max(0, runningBalance)), colX.bal, y);

            y += 20;
        }

        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating schedule");
    }
});

// Waive Interest (Admin Only)
router.post('/waive', isAdmin, async (req, res) => {
    try {
        const { loan_id, waive_amount } = req.body;
        const amount = parseFloat(waive_amount);

        if (!validateAmount(amount)) {
            return res.redirect(`/loans/${loan_id}?error=Invalid waiver amount`);
        }

        const loan = await db.get("SELECT * FROM loans WHERE id = ?", [loan_id]);
        if (!loan) return res.redirect('/loans?error=Loan not found');

        // Check against pending interest (approximate max to total expected interest)
        const totalExpectedInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
        const previouslyWaived = loan.interest_waived || 0;

        if (amount > (totalExpectedInterest - previouslyWaived)) {
            return res.redirect(`/loans/${loan_id}?error=Cannot waive more than pending interest`);
        }

        try {
            await db.run("BEGIN TRANSACTION");

            // Update loan record proactively
            const newWaivedTotal = previouslyWaived + amount;
            const newOutstanding = loan.outstanding - amount;
            const newStatus = newOutstanding <= 0 ? 'closed' : 'active';

            let remarks = 'Interest Waived';
            if (newStatus === 'closed') {
                remarks += ` (Loan Closed. Total Waived off: ₹${newWaivedTotal})`;
            }

            // Add waiver transaction
            await db.run(
                `INSERT INTO transactions (member_id, loan_id, date, type, amount, remarks) 
                 VALUES (?, ?, ?, 'waiver', ?, ?)`,
                [loan.member_id, loan_id, new Date().toISOString().split('T')[0], amount, remarks]
            );

            await db.run("UPDATE loans SET interest_waived = ?, outstanding = ?, status = ? WHERE id = ?",
                [newWaivedTotal, newOutstanding, newStatus, loan_id]);

            await db.run("COMMIT");
            await logAudit(req, 'WAIVE_INTEREST', { loan_id, amount });

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect(`/loans/${loan_id}?msg=Interest waived successfully`);
        } catch (txnErr) {
            await db.run("ROLLBACK");
            console.error("Transaction Error (Waive Interest):", txnErr);
            res.redirect(`/loans/${loan_id}?error=Error processing waiver`);
        }
    } catch (err) {
        console.error(err);
        res.redirect('/loans?error=Error processing waiver');
    }
});

module.exports = router;
