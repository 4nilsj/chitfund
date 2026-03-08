const express = require('express');
const router = express.Router();
const db = require('../config/database');
const ExcelJS = require('exceljs');
const { formatCurrency } = require('../utils/helpers');

// Reports View
router.get('/', async (req, res) => {
    try {
        const totalCollected = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type IN ('contribution', 'repayment', 'penalty')");
        const totalDisbursed = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'disbursement'");
        const totalExpenses = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'");

        // Calculate Fund Balance
        const contributions = totalCollected.total || 0;
        const disbursements = totalDisbursed.total || 0;
        const expenses = totalExpenses.total || 0;

        // Fetch Opening Balance from Settings
        const openingSetting = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
        const openingBalance = openingSetting ? parseInt(openingSetting.value) : 0;

        const fundBalance = (contributions + openingBalance) - (disbursements + expenses);

        const memberStatusKPI = await db.all("SELECT status, COUNT(*) as count FROM members GROUP BY status");

        const defaulters = await db.all(`
            SELECT m.name as borrower_name, l.id, l.outstanding 
            FROM loans l 
            JOIN members m ON l.member_id = m.id 
            WHERE l.status = 'active' AND date(l.start_date, '+' || l.tenure || ' month') < date('now')
        `);

        // Calculate Dynamic stats (Principal Pending & Interest Collected)
        const allLoans = await db.all("SELECT * FROM loans WHERE status = 'active'");
        let calculatedPrincipalPending = 0;
        let totalInterestCollected = 0;

        for (const loan of allLoans) {
            const totalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
            const totalPayable = loan.amount + totalInterest;

            const repayments = await db.get(
                "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
                [loan.id]
            );
            const totalRepaidVal = repayments.total || 0;

            // Principal Pending (Pro-rated)
            const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;
            const principalRepaid = totalRepaidVal * (1 - interestRatio);
            const principalPending = Math.max(0, loan.amount - principalRepaid);

            calculatedPrincipalPending += principalPending;

            // Interest Collected
            const interestCollected = totalRepaidVal * interestRatio;
            totalInterestCollected += interestCollected;
        }

        const totalPenalties = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'penalty'");
        const penalties = totalPenalties.total || 0;
        const activeMembers = await db.get("SELECT COUNT(*) as count FROM members WHERE status='active'");

        // Net Profit = Interest Collected + Penalties - Expenses
        const netProfit = (totalInterestCollected + penalties) - expenses;

        res.render('reports', {
            user: req.session.user,
            activePage: 'reports',
            stats: {
                fundBalance: formatCurrency(fundBalance),
                totalCollected: formatCurrency(contributions),
                totalDisbursed: formatCurrency(disbursements),
                totalExpenses: formatCurrency(expenses),
                totalLoansIssued: allLoans.length || 0,
                totalOutstanding: formatCurrency(calculatedPrincipalPending),
                netProfit: formatCurrency(netProfit),
                activeMembers: activeMembers.count || 0
            },
            memberStats: memberStatusKPI,
            defaulters: defaulters,
            fundName: res.locals.fundName
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading reports");
    }
});


// Export Payment Status Matrix
router.get('/export/payment-status', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Payment Matrix');

        // Get all active members
        const members = await db.all("SELECT id, name FROM members WHERE status = 'active' ORDER BY name");

        // Get last 6 months
        const months = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push({
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            });
        }

        // Define Columns
        const columns = [
            { header: 'Member ID', key: 'id', width: 10 },
            { header: 'Member Name', key: 'name', width: 25 }
        ];

        // Add dynamic month columns
        months.forEach(m => {
            columns.push({ header: m.label, key: m.key, width: 15 });
        });

        sheet.columns = columns;

        // Populate Data
        for (const member of members) {
            const rowData = {
                id: member.id,
                name: member.name
            };

            for (const month of months) {
                const payment = await db.get(
                    `SELECT amount FROM transactions 
                     WHERE member_id = ? 
                     AND type = 'contribution' 
                     AND payment_batch_id LIKE ?
                     LIMIT 1`,
                    [member.id, `${month.key}%`]
                );

                if (payment) {
                    rowData[month.key] = payment.amount;
                } else {
                    rowData[month.key] = 'Pending';
                }
            }

            const row = sheet.addRow(rowData);

            // Conditional Styling for "Pending"
            months.forEach(m => {
                const cell = row.getCell(m.key);
                if (cell.value === 'Pending') {
                    cell.font = { color: { argb: 'FFFF0000' } }; // Red text
                } else {
                    cell.font = { color: { argb: 'FF008000' } }; // Green text
                }
            });
        }

        const filename = 'Payment_Status_Matrix.xlsx';
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        res.send(buffer);

    } catch (err) {
        console.error("Error exporting payment matrix:", err);
        res.status(500).send("Error generating export");
    }
});

// Generic Export (Members/Loans/Transactions)
router.get('/export/:type', async (req, res) => {
    try {
        const type = req.params.type;
        const memberType = req.query.type; // Optional: member or public
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Data');
        let filename = 'Report.xlsx';

        if (type === 'members') {
            // Aggregate financial data per member
            let query = `
                SELECT m.*, 
                    COALESCE(c.total_contributed, 0) as total_contributed,
                    COALESCE(l.loans_count, 0) as loans_count,
                    COALESCE(l.total_loan_amount, 0) as total_loan_amount,
                    COALESCE(l.total_outstanding, 0) as current_outstanding
                FROM members m
                LEFT JOIN (
                    SELECT member_id, SUM(amount) as total_contributed 
                    FROM transactions 
                    WHERE type IN ('contribution', 'penalty') 
                    GROUP BY member_id
                ) c ON m.id = c.member_id
                LEFT JOIN (
                    SELECT member_id, COUNT(*) as loans_count, SUM(amount) as total_loan_amount, SUM(outstanding) as total_outstanding 
                    FROM loans 
                    WHERE status = 'active'
                    GROUP BY member_id
                ) l ON m.id = l.member_id
            `;

            let params = [];
            if (memberType && (memberType === 'member' || memberType === 'public')) {
                query += " WHERE m.type = ?";
                params.push(memberType);
            }

            const members = await db.all(query, params);

            sheet.columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Contact', key: 'contact', width: 15 },
                { header: 'Type', key: 'type', width: 10 },
                { header: 'Status', key: 'status', width: 10 },
                { header: 'Joined', key: 'created_at', width: 15 },
                { header: 'Total Contributed', key: 'total_contributed', width: 20 },
                { header: 'Active Loans', key: 'loans_count', width: 15 },
                { header: 'Loan Amount (Total)', key: 'total_loan_amount', width: 20 },
                { header: 'Current Outstanding', key: 'current_outstanding', width: 20 }
            ];
            sheet.addRows(members);
            filename = memberType ? `${memberType.charAt(0).toUpperCase() + memberType.slice(1)}s_Report.xlsx` : 'Members_Report.xlsx';

        } else if (type === 'transactions') {
            const txns = await db.all(`
                SELECT t.*, m.name as member_name 
                FROM transactions t 
                LEFT JOIN members m ON t.member_id = m.id 
                ORDER BY t.date DESC
            `);
            sheet.columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Member', key: 'member_name', width: 25 },
                { header: 'Type', key: 'type', width: 15 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Remarks', key: 'remarks', width: 30 }
            ];
            txns.forEach(t => {
                sheet.addRow({ ...t, member_name: t.member_name || 'N/A' });
            });
            filename = 'Transactions_Report.xlsx';

        } else if (type === 'loans') {
            const loans = await db.all(`
                SELECT l.*, m.name as borrower_name 
                FROM loans l 
                JOIN members m ON l.member_id = m.id
            `);

            // Calculate details per loan
            const richLoans = await Promise.all(loans.map(async (l) => {
                const totalInterest = (l.amount * l.interest_rate * l.tenure) / 100;
                const totalPayable = l.amount + totalInterest;

                const repayments = await db.get(
                    "SELECT SUM(amount) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
                    [l.id]
                );
                const totalRepaid = repayments.total || 0;

                const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;
                const interestRepaid = totalRepaid * interestRatio;
                const principalRepaid = totalRepaid * (1 - interestRatio);
                const pendingInterest = Math.max(0, totalInterest - interestRepaid);

                return {
                    ...l,
                    total_payable: totalPayable,
                    total_repaid: totalRepaid,
                    principal_repaid: principalRepaid,
                    interest_repaid: interestRepaid,
                    pending_interest: pendingInterest
                };
            }));

            sheet.columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Borrower', key: 'borrower_name', width: 25 },
                { header: 'Principal', key: 'amount', width: 15 },
                { header: 'Rate (%)', key: 'interest_rate', width: 10 },
                { header: 'Tenure (M)', key: 'tenure', width: 10 },
                { header: 'EMI', key: 'emi', width: 15 },
                { header: 'Start Date', key: 'start_date', width: 15 },
                { header: 'Outstanding', key: 'outstanding', width: 15 },
                { header: 'Status', key: 'status', width: 10 },
                { header: 'Total Payable', key: 'total_payable', width: 15 },
                { header: 'Total Repaid', key: 'total_repaid', width: 15 },
                { header: 'Principal Repaid', key: 'principal_repaid', width: 15 },
                { header: 'Interest Repaid', key: 'interest_repaid', width: 15 },
                { header: 'Pending Interest', key: 'pending_interest', width: 15 }
            ];
            sheet.addRows(richLoans);
            filename = 'Loans_Report.xlsx';

        } else if (type === 'overall') {
            // 1. Basic Stats
            const totalCollected = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type IN ('contribution', 'repayment', 'penalty')");
            const totalDisbursed = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'disbursement'");
            const totalExpenses = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'expense'");
            const totalContributions = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'contribution'");
            const totalPenalties = await db.get("SELECT SUM(amount) as total FROM transactions WHERE type = 'penalty'");
            const activeMembers = await db.get("SELECT COUNT(*) as count FROM members WHERE status='active'");

            // 2. Loan & Interest Analysis
            const allLoans = await db.all("SELECT * FROM loans WHERE status = 'active'");
            let calculatedPrincipalPending = 0;
            let totalInterestCollected = 0;
            let totalPrincipalCollected = 0;

            for (const loan of allLoans) {
                const totalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;
                const totalPayable = loan.amount + totalInterest;

                const repayments = await db.get(
                    "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
                    [loan.id]
                );
                const totalRepaidVal = repayments.total || 0;

                const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;
                const principalRepaid = totalRepaidVal * (1 - interestRatio);
                const interestCollected = totalRepaidVal * interestRatio;

                const principalPending = Math.max(0, loan.amount - principalRepaid);

                calculatedPrincipalPending += principalPending;
                totalInterestCollected += interestCollected;
                totalPrincipalCollected += principalRepaid;
            }

            // 3. Opening/Closing Balance
            const openingSetting = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
            const openingBalance = openingSetting ? parseInt(openingSetting.value) : 0;
            const contributions = totalCollected.total || 0;
            const disbursements = totalDisbursed.total || 0;
            const expenses = totalExpenses.total || 0;
            const fundBalance = (contributions + openingBalance) - (disbursements + expenses);

            // 4. Net Profit
            const netProfit = (totalInterestCollected + (totalPenalties.total || 0)) - expenses;

            sheet.columns = [
                { header: 'Metric', key: 'metric', width: 40 },
                { header: 'Value', key: 'value', width: 25 }
            ];
            sheet.addRows([
                { metric: 'Financial Overview', value: '' },
                { metric: 'Opening Balance (System)', value: openingBalance },
                { metric: 'Current Fund Balance', value: fundBalance },
                { metric: 'Net Profit (Est.)', value: netProfit },
                { metric: '', value: '' },
                { metric: 'Cashflow In', value: contributions },
                { metric: '  - Contributions', value: totalContributions.total || 0 },
                { metric: '  - Principal Repaid', value: totalPrincipalCollected },
                { metric: '  - Interest Collected', value: totalInterestCollected },
                { metric: '  - Penalties', value: totalPenalties.total || 0 },
                { metric: '', value: '' },
                { metric: 'Cashflow Out', value: disbursements + expenses },
                { metric: '  - Loans Disbursed', value: disbursements },
                { metric: '  - Expenses', value: expenses },
                { metric: '', value: '' },
                { metric: 'Loan Portfolio', value: '' },
                { metric: 'Active Loans Issued', value: allLoans.length },
                { metric: 'Principal Outstanding', value: calculatedPrincipalPending },
                { metric: '', value: '' },
                { metric: 'Membership', value: activeMembers.count || 0 }
            ]);

            // Style Headers
            [1, 6, 12, 16].forEach(r => sheet.getRow(r).font = { bold: true });

            filename = 'Overall_Report.xlsx';

        } else if (type === 'monthly') {
            const month = req.query.month; // YYYY-MM
            if (!month) throw new Error("Month required");

            // 1. Calculate Opening Balance (Financials BEFORE this month)
            const monthStart = `${month}-01`;
            const openingSetting = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
            const initialBalance = openingSetting ? parseInt(openingSetting.value) : 0;

            const preMonthStats = await db.get(`
                SELECT 
                    SUM(CASE WHEN type IN ('contribution', 'repayment', 'penalty') THEN amount ELSE 0 END) as inflows,
                    SUM(CASE WHEN type IN ('disbursement', 'expense') THEN amount ELSE 0 END) as outflows
                FROM transactions 
                WHERE date < ?
            `, [monthStart]);

            const openingBalance = initialBalance + (preMonthStats.inflows || 0) - (preMonthStats.outflows || 0);

            // 2. Fetch Report Month Data
            const txns = await db.all(`
                SELECT t.*, m.name as member_name, l.amount as loan_principal, l.interest_rate, l.tenure
                FROM transactions t 
                LEFT JOIN members m ON t.member_id = m.id 
                LEFT JOIN loans l ON t.loan_id = l.id
                WHERE strftime('%Y-%m', t.date) = ?
                ORDER BY t.date DESC
            `, [month]);

            // 3. Aggregate Monthly Metrics
            let totalContributions = 0;
            let totalRepayments = 0;
            let totalInterestCollected = 0;
            let totalPrincipalCollected = 0;
            let totalPenalties = 0;
            let totalDisbursed = 0;
            let totalExpenses = 0;
            let loansIssuedCount = 0;

            txns.forEach(t => {
                if (t.type === 'contribution') totalContributions += t.amount;
                else if (t.type === 'penalty') totalPenalties += t.amount;
                else if (t.type === 'expense') totalExpenses += t.amount;
                else if (t.type === 'disbursement') {
                    totalDisbursed += t.amount;
                    loansIssuedCount++; // Approximate, assuming 1 disbursement = 1 loan issuance logic
                }
                else if (t.type === 'repayment') {
                    totalRepayments += t.amount;
                    // Calculate Interest Component
                    // Logic matches reports view: Ratio based on Flat Rate
                    if (t.loan_principal) {
                        const totalInterest = (t.loan_principal * t.interest_rate * t.tenure) / 100;
                        const totalPayable = t.loan_principal + totalInterest;
                        const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;

                        const interestPart = t.amount * interestRatio;
                        totalInterestCollected += interestPart;
                        totalPrincipalCollected += (t.amount - interestPart);
                    } else {
                        // Fallback if loan link missing
                        totalPrincipalCollected += t.amount;
                    }
                }
            });

            const totalInflow = totalContributions + totalRepayments + totalPenalties;
            const totalOutflow = totalDisbursed + totalExpenses;
            const closingBalance = openingBalance + totalInflow - totalOutflow;

            // 4. Build Excel
            // Sheet 1: Summary
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.columns = [
                { header: 'Metric', key: 'metric', width: 30 },
                { header: 'Value', key: 'value', width: 20 }
            ];

            summarySheet.addRows([
                { metric: 'Report Month', value: month },
                { metric: '', value: '' },
                { metric: 'Opening Balance', value: openingBalance },
                { metric: 'Total Inflow', value: totalInflow },
                { metric: '  - Contributions', value: totalContributions },
                { metric: '  - Repayments Received', value: totalRepayments },
                { metric: '    * Principal Portion', value: totalPrincipalCollected },
                { metric: '    * Interest Portion', value: totalInterestCollected },
                { metric: '  - Penalties', value: totalPenalties },
                { metric: '', value: '' },
                { metric: 'Total Outflow', value: totalOutflow },
                { metric: '  - Loans Disbursed', value: totalDisbursed },
                { metric: '  - Expenses', value: totalExpenses },
                { metric: '', value: '' },
                { metric: 'Closing Balance', value: closingBalance },
                { metric: '', value: '' },
                { metric: 'Loans Issued (Count)', value: loansIssuedCount }
            ]);

            // Style the Summary
            summarySheet.getRow(3).font = { bold: true }; // Opening Calc
            summarySheet.getRow(15).font = { bold: true, size: 12 }; // Closing Calc

            // Sheet 2: Detailed Transactions
            const detailSheet = workbook.addWorksheet('Transactions');
            detailSheet.columns = [
                { header: 'ID', key: 'id', width: 10 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Member', key: 'member_name', width: 25 },
                { header: 'Type', key: 'type', width: 15 },
                { header: 'Amount', key: 'amount', width: 15 },
                { header: 'Remarks', key: 'remarks', width: 30 }
            ];
            txns.forEach(t => {
                detailSheet.addRow({
                    id: t.id,
                    date: t.date,
                    member_name: t.member_name || 'System',
                    type: t.type,
                    amount: t.amount,
                    remarks: t.remarks
                });
            });

            filename = `Monthly_Report_${month}.xlsx`;
        }

        const buffer = await workbook.xlsx.writeBuffer();
        console.log(`[Export] Generated ${filename}. Buffer size: ${buffer.length} bytes`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.send(buffer);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating export");
    }
});

// Export Member Passbook
router.get('/export/member/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const member = await db.get("SELECT * FROM members WHERE id = ?", [id]);
        if (!member) return res.status(404).send("Member not found");

        const txns = await db.all("SELECT * FROM transactions WHERE member_id = ? ORDER BY date ASC, id ASC", [id]);

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Passbook');

        sheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Description', key: 'desc', width: 40 },
            { header: 'Type', key: 'type', width: 15 },
            { header: 'Debit', key: 'dr', width: 15 },
            { header: 'Credit', key: 'cr', width: 15 },
            { header: 'Balance', key: 'bal', width: 15 }
        ];

        let runningBalance = 0;
        txns.forEach(t => {
            let credit = 0;
            let debit = 0;
            if (['contribution', 'repayment', 'penalty', 'opening_balance'].includes(t.type)) {
                credit = t.amount;
                runningBalance += t.amount;
            } else {
                debit = t.amount;
                runningBalance -= t.amount;
            }

            sheet.addRow({
                date: t.date,
                desc: t.remarks,
                type: t.type,
                dr: debit || '',
                cr: credit || '',
                bal: runningBalance
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${member.name}_Passbook.xlsx"`);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        res.send(buffer);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error exporting passbook");
    }
});

// Export Member Passbook as PDF
router.get('/export/member/:id/pdf', async (req, res) => {
    try {
        const PDFDocument = require('pdfkit');
        const memberId = req.params.id;

        const member = await db.get("SELECT * FROM members WHERE id = ?", [memberId]);
        if (!member) return res.status(404).send("Member not found");

        const txns = await db.all(`
            SELECT * FROM transactions 
            WHERE member_id = ? 
            ORDER BY date ASC, id ASC
        `, [memberId]);

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${member.name}_Passbook.pdf"`);

        // Pipe PDF to response
        doc.pipe(res);

        // Header
        doc.fontSize(20).text(res.locals.fundName || 'Chit Fund', { align: 'center' });
        doc.fontSize(16).text('Member Passbook', { align: 'center' });
        doc.moveDown();

        // Member Details
        doc.fontSize(12);
        doc.text(`Member: ${member.name}`, 50, doc.y);
        doc.text(`Contact: ${member.contact || 'N/A'}`, 50, doc.y);
        doc.text(`Type: ${member.type}`, 50, doc.y);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 50, doc.y);
        doc.moveDown();

        // Table Header
        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Date', 50, tableTop);
        doc.text('Description', 120, tableTop);
        doc.text('Type', 280, tableTop);
        doc.text('Debit', 350, tableTop);
        doc.text('Credit', 420, tableTop);
        doc.text('Balance', 490, tableTop);

        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table Rows
        let y = tableTop + 25;
        let runningBalance = 0;
        doc.font('Helvetica');

        txns.forEach((t, index) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            let credit = 0;
            let debit = 0;
            if (['contribution', 'repayment', 'penalty'].includes(t.type)) {
                credit = t.amount;
                runningBalance += t.amount;
            } else {
                debit = t.amount;
                runningBalance -= t.amount;
            }

            doc.fontSize(9);
            doc.text(new Date(t.date).toLocaleDateString(), 50, y, { width: 60 });
            doc.text(t.remarks.substring(0, 25), 120, y, { width: 150 });
            doc.text(t.type, 280, y, { width: 60 });
            doc.text(debit ? `₹${debit.toFixed(2)}` : '-', 350, y, { width: 60 });
            doc.text(credit ? `₹${credit.toFixed(2)}` : '-', 420, y, { width: 60 });
            doc.text(`₹${runningBalance.toFixed(2)}`, 490, y, { width: 60 });

            y += 20;
        });

        // Footer
        doc.moveDown(2);
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(`Final Balance: ₹${runningBalance.toFixed(2)}`, { align: 'right' });

        doc.end();
    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating PDF passbook");
    }
});

// Interest Earned Report
router.get('/interest', async (req, res) => {
    try {
        // Fetch all loans with member details
        const loans = await db.all(`
            SELECT l.*, m.name as borrower_name, m.type as borrower_type
            FROM loans l
            JOIN members m ON l.member_id = m.id
            ORDER BY l.status = 'active' DESC, l.id DESC
        `);

        // Calculate interest details for each loan
        const loansWithInterest = await Promise.all(loans.map(async (loan) => {
            // Total Interest = (Principal × Rate × Tenure) / 100
            const totalInterest = (loan.amount * loan.interest_rate * loan.tenure) / 100;

            // Total Payable = Principal + Interest
            const totalPayable = loan.amount + totalInterest;

            // Get all repayments for this loan
            const repayments = await db.get(
                "SELECT SUM(amount) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
                [loan.id]
            );
            const totalRepaid = repayments.total || 0;

            // Pro-rated Interest Calculation
            const interestRatio = totalPayable > 0 ? (totalInterest / totalPayable) : 0;
            const interestCollected = totalRepaid * interestRatio;

            // Pending Interest = Total Interest - Interest Collected
            const pendingInterest = Math.max(0, totalInterest - interestCollected);

            return {
                ...loan,
                totalInterest,
                totalPayable,
                totalRepaid,
                interestCollected,
                pendingInterest
            };
        }));

        // Calculate totals
        const totals = loansWithInterest.reduce((acc, loan) => ({
            totalInterest: acc.totalInterest + loan.totalInterest,
            interestCollected: acc.interestCollected + loan.interestCollected,
            pendingInterest: acc.pendingInterest + loan.pendingInterest
        }), { totalInterest: 0, interestCollected: 0, pendingInterest: 0 });

        res.render('interest_report', {
            user: req.session.user,
            fundName: res.locals.fundName,
            activePage: 'reports',
            loans: loansWithInterest,
            totals,
            formatCurrency
        });
    } catch (err) {
        console.error('Error loading interest report:', err);
        res.status(500).send("Error loading interest report");
    }
});

// Payment Status Dashboard
router.get('/payment-status', async (req, res) => {
    try {
        // Get all active members
        const members = await db.all("SELECT id, name, type, status FROM members WHERE status = 'active' ORDER BY name");

        // Get last 6 months
        const months = [];
        const today = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            months.push({
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                label: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                isCurrent: i === 0
            });
        }

        // Build payment status grid
        const paymentGrid = await Promise.all(members.map(async (member) => {
            const monthlyStatus = await Promise.all(months.map(async (month) => {
                // Check if payment exists for this month
                const payment = await db.get(
                    `SELECT id, amount FROM transactions 
                     WHERE member_id = ? 
                     AND type = 'contribution' 
                     AND payment_batch_id LIKE ?
                     LIMIT 1`,
                    [member.id, `${month.key}%`]
                );

                return {
                    month: month.key,
                    paid: !!payment,
                    amount: payment ? payment.amount : 0
                };
            }));

            return {
                member,
                payments: monthlyStatus
            };
        }));

        res.render('payment_status', {
            user: req.session.user,
            fundName: res.locals.fundName,
            activePage: 'reports',
            members: paymentGrid,
            months,
            formatCurrency
        });
    } catch (err) {
        console.error('Error loading payment status:', err);
        res.status(500).send("Error loading payment status");
    }
});

module.exports = router;
