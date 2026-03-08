const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { calculateMonthlyObligation } = require('../utils/helpers');
const { generateReceipt } = require('../utils/receiptGenerator');

// Process Combined Monthly Payment
router.post('/monthly', async (req, res) => {
    let { member_id, month, amount, allow_partial, remarks } = req.body;

    try {
        // Validate member exists and is active
        const member = await db.get("SELECT id, name, status FROM members WHERE id = ?", [member_id]);
        if (!member) {
            return res.redirect('/?error=invalid_member');
        }
        if (member.status !== 'active') {
            return res.redirect('/?error=inactive_member');
        }

        // Calculate monthly obligation
        const obligation = await calculateMonthlyObligation(member_id, month);

        // Check if already paid
        if (obligation.alreadyPaid) {
            return res.redirect('/?error=already_paid_month');
        }

        const paidAmount = parseFloat(amount);
        const isPartial = paidAmount < obligation.totalDue;

        // Handle floating point precision issues roughly
        // Better to use cents/paisa but float is used in DB.

        // Partial Payment Validation
        if (isPartial && !allow_partial) {
            return res.redirect(`/?error=insufficient_payment&required=${obligation.totalDue}&paid=${paidAmount}`);
        }

        // Generate batch ID
        const batchId = `${month}-${member_id}-${Date.now()}`;
        const paymentDate = new Date().toISOString().split('T')[0];

        // Start atomic transaction
        await db.run('BEGIN TRANSACTION');

        let remainingAmount = paidAmount;
        let paymentRemarks = remarks || `Monthly payment for ${month}`;
        if (isPartial) paymentRemarks += " (Partial)";

        try {
            // 1. Allocate to Contribution (Priority 1)
            const contributionToPay = Math.min(remainingAmount, obligation.contributionAmount);

            if (contributionToPay > 0) {
                const contributionResult = await db.run(
                    `INSERT INTO transactions 
                     (member_id, date, type, amount, remarks, payment_batch_id)
                     VALUES (?, ?, 'contribution', ?, ?, ?)`,
                    [member_id, paymentDate, contributionToPay,
                        `Monthly contribution for ${month}${contributionToPay < obligation.contributionAmount ? ' (Partial)' : ''}`, month]
                );

                // Generate receipt for contribution
                try {
                    const transaction = {
                        id: contributionResult.lastID,
                        date: paymentDate,
                        type: 'contribution',
                        amount: contributionToPay,
                        remarks: `Monthly contribution for ${month}`
                    };
                    const receiptPath = await generateReceipt(transaction, member, res.locals.fundName);

                    // Update transaction with receipt path
                    await db.run(
                        "UPDATE transactions SET receipt_path = ? WHERE id = ?",
                        [receiptPath, contributionResult.lastID]
                    );
                } catch (receiptErr) {
                    console.error('Error generating receipt:', receiptErr);
                    // Continue even if receipt generation fails
                }

                remainingAmount -= contributionToPay;
            }

            // 2. Allocate to Loans (Priority 2)
            if (obligation.loans) {
                for (const loan of obligation.loans) {
                    if (remainingAmount <= 0) break;

                    const loanPayment = Math.min(remainingAmount, loan.emi, loan.outstanding);

                    if (loanPayment > 0) {
                        await db.run(
                            `INSERT INTO transactions 
                             (member_id, date, type, amount, remarks, payment_batch_id, loan_id)
                             VALUES (?, ?, 'repayment', ?, ?, ?, ?)`,
                            [member_id, paymentDate, loanPayment,
                                `EMI for Loan #${loan.id} - ${month}${loanPayment < loan.emi ? ' (Partial)' : ''}`, batchId, loan.id]
                        );

                        // Update loan outstanding
                        // Outstanding = (EMI × Tenure) - Total Repayments Made
                        const totalEMIAmount = loan.emi * loan.tenure;
                        const totalRepayments = await db.get(
                            'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = "repayment"',
                            [loan.id]
                        );
                        const newOutstanding = totalEMIAmount - (totalRepayments.total || 0);
                        const newStatus = newOutstanding <= 0 ? 'closed' : 'active';

                        await db.run(
                            "UPDATE loans SET outstanding = ?, status = ? WHERE id = ?",
                            [newOutstanding, newStatus, loan.id]
                        );

                        remainingAmount -= loanPayment;
                    }
                }
            }

            // Commit
            await db.run('COMMIT');
            res.redirect(`/?msg=Payment recorded successfully${isPartial ? ' (Partial)' : ''}&type=${isPartial ? 'warning' : 'success'}`);
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error processing monthly payment:', err);
        res.status(500).send("Error processing payment");
    }
});

module.exports = router;
