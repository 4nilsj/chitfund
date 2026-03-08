const TransactionService = require('../services/transactionService');
const MemberService = require('../services/memberService');
const { formatCurrency, logAudit } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');

const TransactionController = {
    // List Transactions
    async list(req, res) {
        try {
            const userType = req.session.user.userType;
            const memberId = req.session.user.memberId;
            const isMember = userType === 'member';

            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const offset = (page - 1) * limit;

            const sortBy = req.query.sortBy || 'date';
            const sortDir = req.query.sortDir || 'desc';
            const search = req.query.search || '';

            const { transactions, totalItems } = await TransactionService.getTransactions(
                { memberId, isMember, sortBy, sortDir, search },
                { limit, offset }
            );

            const totalPages = Math.ceil(totalItems / limit);

            // Fetch members for dropdown (only if not member)
            const members = isMember
                ? []
                : (await MemberService.getAllMembers({ type: 'all', status: 'active' }, { limit: 1000 })).members; // Fetch both regular members and public users

            if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
                return res.render('partials/transaction_table', {
                    transactions,
                    user: req.session.user,
                    formatCurrency,
                    sortBy,
                    sortDir,
                    search,
                    pagination: {
                        baseUrl: '/transactions',
                        currentPage: page,
                        totalPages
                    }
                });
            }

            res.render('transactions', {
                user: req.session.user,
                activePage: 'transactions',
                transactions,
                members,
                currentPage: page,
                totalPages,
                pagination: {
                    baseUrl: '/transactions',
                    currentPage: page,
                    totalPages
                },
                sortBy,
                sortDir,
                search,
                formatCurrency,
                fundName: res.locals.fundName,
                error: req.query.error || null,
                month: req.query.month || null,
                msg: req.query.msg || null
            });
        } catch (err) {
            console.error(err);
            res.status(500).send("Error loading transactions");
        }
    },

    // Add Transaction
    async add(req, res) {
        const { person_id, type, amount, date, remarks } = req.body;
        let memberId = person_id ? parseInt(person_id) : null;
        if (isNaN(memberId)) memberId = null;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect(`/transactions?error=${encodeURIComponent(errors.array()[0].msg)}`);
        }

        try {
            // Duplicate check
            const duplicateMonth = await TransactionService.checkDuplicatePayment(memberId, type, date);
            if (duplicateMonth) {
                const errorType = type === 'contribution' ? 'contribution' : 'repayment';
                return res.redirect(`/transactions?error=duplicate_${errorType}&month=${duplicateMonth}`);
            }

            let paymentBatchId = null;
            if (type === 'contribution') {
                paymentBatchId = date.substring(0, 7);
            }

            await TransactionService.createTransaction({
                member_id: memberId, type, amount, date, remarks, payment_batch_id: paymentBatchId
            });

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/transactions?msg=Transaction added successfully');
        } catch (err) {
            console.log("CATCH BLOCK DEBUG - err.code:", err.code);
            console.log("CATCH BLOCK DEBUG - err.message:", err.message);
            if (err.code === 'SQLITE_CONSTRAINT' || (err.message && err.message.includes('UNIQUE constraint'))) {
                const transactionMonth = date.substring(0, 7);
                const errorType = type === 'contribution' ? 'contribution' : 'repayment';
                return res.redirect(`/transactions?error=duplicate_${errorType}&month=${transactionMonth}`);
            }
            console.error(err);
            res.status(500).send("Error adding transaction");
        }
    },

    // Bulk Add
    async bulkAdd(req, res) {
        const { member_ids, amount, date, remarks } = req.body;
        const ids = Array.isArray(member_ids) ? member_ids : (member_ids ? [member_ids] : []);

        let addedCount = 0;
        let skippedCount = 0;

        try {
            const transactionMonth = date.substring(0, 7);
            const type = 'contribution';

            for (const memberId of ids) {
                const isDuplicate = await TransactionService.checkDuplicatePayment(memberId, type, date);
                if (isDuplicate) {
                    skippedCount++;
                    continue;
                }

                await TransactionService.createTransaction({
                    member_id: memberId, type, amount, date, remarks, payment_batch_id: transactionMonth
                });
                addedCount++;
            }

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect(`/transactions?msg=${addedCount} contributions recorded. ${skippedCount > 0 ? skippedCount + ' duplicates skipped.' : ''}`);
        } catch (err) {
            console.error(err);
            res.status(500).send("Error processing bulk contributions");
        }
    },

    // Delete Transaction
    async delete(req, res) {
        const { id } = req.params;
        try {
            const txn = await TransactionService.deleteTransaction(id);
            if (txn) {
                await logAudit(req, 'DELETE_TRANSACTION', { id: txn.id, amount: txn.amount, type: txn.type, member_id: txn.member_id });
            }

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/transactions');
        } catch (err) {
            console.error(err);
            res.status(500).send("Error deleting transaction");
        }
    },

    // View Details
    async detail(req, res) {
        try {
            const { id } = req.params;
            const txn = await TransactionService.getTransactionById(id);
            if (!txn) return res.status(404).send("Transaction not found");

            res.render('transaction_detail', {
                user: req.session.user,
                activePage: 'transactions',
                txn,
                formatCurrency,
                fundName: res.locals.fundName
            });
        } catch (err) {
            console.error(err);
            res.status(500).send("Error loading transaction details");
        }
    },

    // Download Receipt
    async downloadReceipt(req, res) {
        try {
            const { id } = req.params;
            const txn = await TransactionService.getTransactionById(id);
            if (!txn) return res.status(404).send("Transaction not found");

            const doc = new PDFDocument({ margin: 50, size: 'A5', layout: 'landscape' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Receipt_${txn.id}.pdf"`);
            doc.pipe(res);

            // --- PDF Styling (Copied from original route) ---
            const primaryColor = '#2c3e50';
            const accentColor = '#34495e';
            const amountColor = '#27ae60';

            const formatMoney = (amount) => {
                return "Rs. " + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
            };

            doc.rect(20, 20, 550, 350).stroke(primaryColor);
            doc.rect(20, 20, 550, 60).fill(primaryColor);

            doc.fillColor('white').fontSize(24).font('Helvetica-Bold')
                .text(res.locals.fundName || 'Chit Fund', 20, 35, { width: 550, align: 'center' });

            doc.fillColor('#bdc3c7').fontSize(10).font('Helvetica')
                .text('OFFICIAL RECEIPT', 20, 65, { width: 550, align: 'center', characterSpacing: 2 });

            doc.fillColor('black').fontSize(10).font('Helvetica');
            const receiptNo = `R-${String(txn.id).padStart(6, '0')}`;
            const dateStr = new Date(txn.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

            const metaY = 100;
            doc.text(`Receipt No:`, 50, metaY);
            doc.font('Helvetica-Bold').text(receiptNo, 120, metaY);

            doc.font('Helvetica').text(`Date:`, 400, metaY);
            doc.font('Helvetica-Bold').text(dateStr, 440, metaY);

            const contentY = 140;
            const col1Ex = 60;
            const col2Ex = 200;

            doc.fontSize(12).font('Helvetica').fillColor(accentColor);
            doc.text('Received from:', col1Ex, contentY);
            doc.fontSize(14).font('Helvetica-Bold').fillColor('black');
            doc.text(txn.member_name || 'Deleted Member', col2Ex, contentY - 2);

            doc.moveTo(50, contentY + 20).lineTo(540, contentY + 20).dash(2, { space: 2 }).strokeColor('#bdc3c7').stroke().undash();

            const amountY = contentY + 40;
            doc.fontSize(12).font('Helvetica').fillColor(accentColor);
            doc.text('The Sum of:', col1Ex, amountY);

            doc.rect(col2Ex - 10, amountY - 10, 300, 40).fill('#ecf0f1');
            doc.fontSize(18).font('Helvetica-Bold').fillColor(amountColor);
            doc.text(formatMoney(txn.amount), col2Ex, amountY + 2);

            const towardsY = amountY + 50;
            doc.fontSize(12).font('Helvetica').fillColor(accentColor);
            doc.text('Towards:', col1Ex, towardsY);

            let purpose = txn.type.charAt(0).toUpperCase() + txn.type.slice(1);
            if (txn.remarks && txn.remarks.trim() !== '') purpose += ` - ${txn.remarks}`;

            doc.fontSize(12).font('Helvetica-Bold').fillColor('black');
            doc.text(purpose, col2Ex, towardsY);

            const batchY = towardsY + 30;
            if (txn.payment_batch_id) {
                doc.fontSize(12).font('Helvetica').fillColor(accentColor);
                doc.text('For Month:', col1Ex, batchY);
                doc.fontSize(12).font('Helvetica-Bold').fillColor('black');
                doc.text(txn.payment_batch_id, col2Ex, batchY);
            }

            const footerY = 300;
            doc.moveTo(380, footerY).lineTo(520, footerY).strokeColor('black').stroke();
            doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d');
            doc.text('Authorized Signature', 380, footerY + 5, { width: 140, align: 'center' });

            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#95a5a6');
            doc.text('Thank you for your payment.', 20, 340, { width: 550, align: 'center' });

            doc.end();

        } catch (err) {
            console.error(err);
            res.status(500).send("Error generating receipt");
        }
    }
};

module.exports = TransactionController;
