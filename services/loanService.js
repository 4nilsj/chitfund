const db = require('../config/database');

const LoanService = {
    async getLoanById(id) {
        return await db.get("SELECT * FROM loans WHERE id = ?", [id]);
    },

    async updateLoanOutstanding(id, amount, status) {
        return await db.run("UPDATE loans SET outstanding = ?, status = ? WHERE id = ?", [amount, status, id]);
    },

    // Used when deleting a repayment transaction
    async revertLoanBalance(loanId, amount) {
        const loan = await this.getLoanById(loanId);
        if (loan) {
            const newOutstanding = loan.outstanding + amount;
            // If it was closed, re-open it
            await db.run("UPDATE loans SET outstanding = ?, status = 'active' WHERE id = ?", [newOutstanding, loanId]);
            console.log(`Reverted loan L${loan.id} balance. Added ${amount}. New Outstanding: ${newOutstanding}`);
            return newOutstanding;
        }
        return null;
    }
};

module.exports = LoanService;
