const db = require('../config/database');

const MemberService = {
    // Get all members with filters, sorting, and pagination
    async getAllMembers(filters = {}, pagination = {}) {
        const { type = 'member', search = '', status = 'all', sortBy, sortDir } = filters;
        const { limit = 20, offset = 0 } = pagination;

        let whereConditions = [];
        let queryParams = [];

        if (type !== 'all') {
            whereConditions.push('type = ?');
            queryParams.push(type);
        }

        if (search) {
            whereConditions.push('(name LIKE ? OR contact LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        if (status !== 'all') {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Count total
        const countRes = await db.get(
            `SELECT COUNT(*) as total FROM members ${whereClause}`,
            queryParams
        );
        const totalRecords = countRes.total;

        // Sorting Logic
        const allowedSortColumns = {
            'id': 'id',
            'name': 'name',
            'contact': 'contact',
            'status': 'status'
        };

        const sortColumn = allowedSortColumns[sortBy] || 'name';
        const sortDirection = (sortDir && sortDir.toLowerCase() === 'desc') ? 'DESC' : 'ASC';

        const secondarySort = sortColumn === 'id' ? '' : ', id ASC';

        // Fetch members
        const members = await db.all(
            `SELECT * FROM members ${whereClause} ORDER BY ${sortColumn} ${sortDirection} ${secondarySort} LIMIT ? OFFSET ?`,
            [...queryParams, limit, offset]
        );

        return { members, totalRecords };
    },

    async getMemberStats(memberId, memberType = 'member') {
        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);

        // Paid this month? We must check payment_batch_id which stores the targeted month (YYYY-MM), NOT the literal creation date.
        const paid = await db.get(
            "SELECT id FROM transactions WHERE member_id = ? AND type = 'contribution' AND payment_batch_id = ?",
            [memberId, currentMonth]
        );

        // Active loans count & outstanding
        const loanRes = await db.get("SELECT COUNT(*) as count, SUM(outstanding) as total FROM loans WHERE member_id = ? AND status = 'active'", [memberId]);

        // Total contributions
        const totalContribRes = await db.get("SELECT SUM(amount) as total FROM transactions WHERE member_id = ? AND type = 'contribution'", [memberId]);
        const totalContributions = totalContribRes.total || 0;

        const balance = memberType === 'member' ? totalContributions : (loanRes.total || 0);

        return {
            paidThisMonth: !!paid,
            activeLoansCount: loanRes.count,
            loanOutstanding: loanRes.total || 0,
            totalContributions: totalContributions,
            balance: balance
        };
    },

    async getMemberById(id) {
        return await db.get("SELECT * FROM members WHERE id = ?", [id]);
    },

    async createMember(name, contact, type) {
        // Check Duplicate
        const existing = await db.get("SELECT id FROM members WHERE name = ? AND type = ?", [name, type]);
        if (existing) {
            throw new Error("Member already exists");
        }
        return await db.run("INSERT INTO members (name, contact, type, status) VALUES (?, ?, ?, 'active')", [name, contact, type]);
    },

    async updateMember(id, name, contact) {
        return await db.run("UPDATE members SET name = ?, contact = ? WHERE id = ?", [name, contact, id]);
    },

    async updateMemberType(id, type) {
        return await db.run("UPDATE members SET type = ? WHERE id = ?", [type, id]);
    },

    async updateMemberStatus(id, status) {
        return await db.run("UPDATE members SET status = ? WHERE id = ?", [status, id]);
    },

    async deleteMember(id) {
        // Warning: Cascading delete
        await db.run("DELETE FROM transactions WHERE member_id = ?", [id]);
        await db.run("DELETE FROM loans WHERE member_id = ?", [id]);
        return await db.run("DELETE FROM members WHERE id = ?", [id]);
    },

    // Additional data fetchers for details view
    async getMemberLoans(id) {
        return await db.all("SELECT * FROM loans WHERE member_id = ? ORDER BY id DESC", [id]);
    },

    async getMemberTransactions(id, limit = 50) {
        return await db.all("SELECT * FROM transactions WHERE member_id = ? ORDER BY date DESC, id DESC LIMIT ?", [id, limit]);
    },

    async getAllMemberTransactions(id) {
        return await db.all("SELECT * FROM transactions WHERE member_id = ? ORDER BY date ASC, id ASC", [id]);
    },

    async getLoanRepaymentsSum(loanId) {
        const res = await db.get(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE loan_id = ? AND type = 'repayment'",
            [loanId]
        );
        return res.total || 0;
    }
};

module.exports = MemberService;
