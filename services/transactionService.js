const db = require('../config/database');
const LoanService = require('./loanService');

const TransactionService = {
    async getTransactions(filters = {}, pagination = {}) {
        const { memberId, isMember, search, sortBy, sortDir } = filters;
        const { limit = 20, offset = 0 } = pagination;

        let baseQuery = `
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.id 
            WHERE 1=1
        `;
        const params = [];

        if (isMember) {
            baseQuery += ` AND t.member_id = ?`;
            params.push(memberId);
        }

        if (search) {
            baseQuery += ` AND (m.name LIKE ? OR t.type LIKE ? OR t.remarks LIKE ?)`;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam);
        }

        const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
        const countRes = await db.get(countQuery, params);
        const totalItems = countRes.total;

        // Sorting Logic
        const allowedSortColumns = {
            'id': 't.id',
            'date': 't.date',
            'type': 't.type',
            'amount': 't.amount',
            'person_name': 'm.name'
        };

        const sortColumn = allowedSortColumns[sortBy] || 't.date';
        const sortDirection = (sortDir && sortDir.toLowerCase() === 'asc') ? 'ASC' : 'DESC';

        // Always add id as secondary sort to ensure stable pagination
        const secondarySort = sortColumn === 't.id' ? '' : `, t.id DESC`;

        const transactionsQuery = `
            SELECT t.*, m.name as person_name 
            ${baseQuery}
            ORDER BY ${sortColumn} ${sortDirection} ${secondarySort}
            LIMIT ? OFFSET ?
        `;

        const txParams = [...params, limit, offset];
        const transactions = await db.all(transactionsQuery, txParams);

        return { transactions, totalItems };
    },

    async getTransactionById(id) {
        return await db.get(`
            SELECT t.*, m.name as member_name, m.contact
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.id 
            WHERE t.id = ?
        `, [id]);
    },

    async checkDuplicatePayment(memberId, type, date) {
        if (type !== 'contribution' && type !== 'repayment') return false;

        const transactionMonth = date.substring(0, 7); // YYYY-MM
        const existingPayment = await db.get(
            `SELECT id FROM transactions 
             WHERE member_id = ? 
             AND type = ? 
             AND (payment_batch_id LIKE ? OR date LIKE ?) 
             LIMIT 1`,
            [memberId, type, `${transactionMonth}%`, `${transactionMonth}%`]
        );
        return existingPayment ? transactionMonth : null;
    },

    async createTransaction(data) {
        const { member_id, type, amount, date, remarks, payment_batch_id } = data;

        const result = await db.run(
            "INSERT INTO transactions (member_id, type, amount, date, remarks, payment_batch_id) VALUES (?, ?, ?, ?, ?, ?)",
            [member_id, type, amount, date, remarks, payment_batch_id]
        );

        const transactionId = result.lastID;

        // Handle Loan Repayment logic
        if (type === 'repayment' && remarks.startsWith('Loan:')) {
            const loanIdParts = remarks.split(':');
            if (loanIdParts.length > 1) {
                const loanId = loanIdParts[1].trim();
                const loan = await LoanService.getLoanById(loanId);

                if (loan) {
                    const newOutstanding = Math.max(0, loan.outstanding - amount);
                    const status = newOutstanding < 10 ? 'closed' : 'active';
                    await LoanService.updateLoanOutstanding(loanId, newOutstanding, status);

                    // Link transaction to loan
                    await db.run("UPDATE transactions SET loan_id = ? WHERE id = ?", [loanId, transactionId]);
                }
            }
        }

        return transactionId;
    },

    async deleteTransaction(id) {
        const txn = await db.get("SELECT * FROM transactions WHERE id = ?", [id]);
        if (!txn) return null;

        // Revert loan if repayment
        if (txn.type === 'repayment' && txn.loan_id) {
            await LoanService.revertLoanBalance(txn.loan_id, txn.amount);
        }

        await db.run("DELETE FROM transactions WHERE id = ?", [id]);
        return txn;
    }
};

module.exports = TransactionService;
