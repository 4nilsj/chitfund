const MemberService = require('../services/memberService');
const { formatCurrency, sanitizeString } = require('../utils/helpers');
const { validationResult } = require('express-validator');

const MemberController = {
    // List Members
    async list(req, res) {
        try {
            const type = req.query.type || 'member';
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const offset = (page - 1) * limit;
            const search = req.query.search || '';
            const statusFilter = req.query.status || 'all';
            const sortBy = req.query.sortBy || 'name';
            const sortDir = req.query.sortDir || 'asc';

            const { members, totalRecords } = await MemberService.getAllMembers(
                { type, search, status: statusFilter, sortBy, sortDir },
                { limit, offset }
            );

            // Enrich members with stats
            const membersWithStatus = await Promise.all(members.map(async (m) => {
                const stats = await MemberService.getMemberStats(m.id, m.type);
                return { ...m, ...stats };
            }));

            const totalPages = Math.ceil(totalRecords / limit);

            if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
                return res.render('partials/member_table', {
                    members: membersWithStatus,
                    type,
                    user: req.session.user,
                    formatCurrency,
                    search,
                    statusFilter,
                    sortBy,
                    sortDir,
                    totalItems: totalRecords,
                    pagination: {
                        baseUrl: '/members',
                        currentPage: page,
                        totalPages
                    }
                });
            }

            res.render('members', {
                user: req.session.user,
                activePage: type === 'public' ? 'public' : 'members',
                type,
                members: membersWithStatus,
                totalItems: totalRecords,
                currentPage: page,
                totalPages,
                pagination: {
                    baseUrl: '/members',
                    currentPage: page,
                    totalPages
                },
                search,
                statusFilter,
                sortBy,
                sortDir,
                formatCurrency,
                fundName: res.locals.fundName,
                msg: req.query.msg,
                typeMsg: req.query.typeMsg
            });

        } catch (err) {
            console.error(err);
            res.status(500).send("Error loading members");
        }
    },

    // View Member Details
    async detail(req, res) {
        try {
            const { id } = req.params;
            if (isNaN(id)) return res.status(404).send("Invalid Member ID");

            const member = await MemberService.getMemberById(id);
            if (!member) return res.status(404).send("Member not found");

            const loans = await MemberService.getMemberLoans(id);
            const transactions = await MemberService.getMemberTransactions(id);

            // Calculate totals (can be moved to helper/service if complex)
            // Re-using logic from original route for now
            // Note: In a real refactor, stats calculation should be in Service.
            // For now, let's keep the aggregation logic similar to original to ensure correctness.

            // ... (We will keep the loan breakdown logic in controller for this step, or move to a helper)
            // To be cleaner, I'll keep the heavy logic here for now, but ideally it goes to Service.
            // Actually, let's keep it here as it involves iterating loans and Transactions.

            // Stats
            const stats = await MemberService.getMemberStats(id, member.type);

            // Calculate loan breakdown
            let loanBreakdown = {
                totalPrincipal: 0,
                principalPending: 0,
                principalPaid: 0,
                interestPaid: 0,
                interestPending: 0,
                totalRepaid: 0,
                emisPaid: 0,
                emisPending: 0,
                totalEmis: 0,
                calculatedOutstanding: 0,
                totalPayable: 0
            };

            for (const loan of loans) {
                loanBreakdown.totalPrincipal += loan.amount;
                loanBreakdown.totalEmis += loan.tenure;

                const rawTotalInterestForLoan = (loan.amount * loan.interest_rate * loan.tenure) / 100;
                const totalInterestForLoan = Math.max(0, rawTotalInterestForLoan - (loan.interest_waived || 0));
                const totalPayableForLoan = loan.amount + totalInterestForLoan;

                const totalRepaidAmount = await MemberService.getLoanRepaymentsSum(loan.id);
                loanBreakdown.totalRepaid += totalRepaidAmount;

                const outstandingForLoan = Math.max(0, totalPayableForLoan - totalRepaidAmount);
                loanBreakdown.calculatedOutstanding += outstandingForLoan;
                loanBreakdown.totalPayable += totalPayableForLoan;

                const interestRatio = totalPayableForLoan > 0 ? (totalInterestForLoan / totalPayableForLoan) : 0;
                const interestCollectedForLoan = totalRepaidAmount * interestRatio;
                const interestPendingForLoan = Math.max(0, totalInterestForLoan - interestCollectedForLoan);

                loanBreakdown.interestPaid += interestCollectedForLoan;
                loanBreakdown.interestPending += interestPendingForLoan;

                const principalRepaidForLoan = totalRepaidAmount * (1 - interestRatio);
                loanBreakdown.principalPending += Math.max(0, loan.amount - principalRepaidForLoan);
                loanBreakdown.principalPaid += principalRepaidForLoan;

                const emisPaidForLoan = Math.floor(totalRepaidAmount / loan.emi);
                loanBreakdown.emisPaid += emisPaidForLoan;

                const emisPendingForLoan = Math.max(0, loan.tenure - emisPaidForLoan);
                loanBreakdown.emisPending += emisPendingForLoan;
            }

            res.render('member_detail', {
                user: req.session.user,
                activePage: 'members',
                member,
                loans,
                transactions,
                stats: {
                    contributed: stats.totalContributions,
                    borrowed: loanBreakdown.totalPrincipal,
                    outstanding: stats.loanOutstanding,
                    paidThisMonth: stats.paidThisMonth
                },
                loanBreakdown,
                formatCurrency,
                fundName: res.locals.fundName
            });

        } catch (err) {
            console.error(err);
            res.status(500).send("Error loading member details");
        }
    },

    // View Member Passbook
    async viewPassbook(req, res) {
        try {
            const { id } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = 50;
            const offset = (page - 1) * limit;

            const member = await MemberService.getMemberById(id);
            if (!member) return res.status(404).send("Member not found");

            // Needed for pagination count
            // MemberService.getAllMemberTransactions returns ALL. 
            // Ideally we should have a count method or paginate in DB.
            // Original code fetched ALL to calculate running balance correctly!
            // "const allTxns = await db.all(...)"

            const allTxns = await MemberService.getAllMemberTransactions(id);
            const totalItems = allTxns.length;
            const totalPages = Math.ceil(totalItems / limit);

            let runningBalance = 0;
            const txnsWithBalance = allTxns.map(t => {
                if (['contribution', 'repayment', 'penalty', 'opening_balance'].includes(t.type)) {
                    runningBalance += t.amount;
                } else {
                    runningBalance -= t.amount;
                }
                return { ...t, balanceAfter: runningBalance };
            });

            const displayedTxns = txnsWithBalance.slice(offset, offset + limit);

            res.render('passbook', {
                user: req.session.user,
                activePage: 'members',
                member: member,
                transactions: displayedTxns,
                runningBalance: runningBalance,
                pagination: {
                    baseUrl: `/members/${id}/passbook`,
                    currentPage: page,
                    totalPages: totalPages
                },
                formatCurrency,
                fundName: res.locals.fundName
            });

        } catch (err) {
            console.error(err);
            res.status(500).send("Error loading passbook");
        }
    },

    // Add Member
    async create(req, res) {
        const { name, contact, type } = req.body;
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.redirect(`/members?type=${type}&msg=${errors.array()[0].msg}&typeMsg=error`);
        }

        try {
            const cleanName = sanitizeString(name);
            await MemberService.createMember(cleanName, contact, type);

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect(`/members?type=${type}&msg=Member added successfully`);
        } catch (err) {
            if (err.message === "Member already exists") {
                return res.redirect(`/members?type=${type}&msg=Member already exists&typeMsg=error`);
            }
            console.error(err);
            res.status(500).send("Error adding member");
        }
    },

    // Edit Member
    async update(req, res) {
        const { name, contact } = req.body;
        const { id } = req.params;

        try {
            const member = await MemberService.getMemberById(id);
            if (!member) return res.status(404).send("Member not found");

            const cleanName = sanitizeString(name);
            const cleanContact = sanitizeString(contact);

            await MemberService.updateMember(id, cleanName, cleanContact);

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect(`/members?type=${member.type}&msg=Member updated`);
        } catch (err) {
            console.error(err);
            res.status(500).send("Error updating member");
        }
    },

    // Toggle Public
    async moveToPublic(req, res) {
        const { member_id } = req.body;
        try {
            await MemberService.updateMemberType(member_id, 'public');

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/members?msg=Member moved to Public list');
        } catch (err) {
            console.error(err);
            res.status(500).send("Error moving member");
        }
    },

    // Toggle Status
    async toggleStatus(req, res) {
        const { member_id, status } = req.body;
        try {
            await MemberService.updateMemberStatus(member_id, status);

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect('/members?msg=Member status updated');
        } catch (err) {
            console.error(err);
            res.status(500).send("Error updating status");
        }
    },

    // Delete
    async delete(req, res) {
        const { id } = req.params;
        try {
            const member = await MemberService.getMemberById(id);
            await MemberService.deleteMember(id);

            // Emit Real-Time Dashboard Update
            if (req.app.get('io')) {
                req.app.get('io').emit('dashboard_update');
            }

            res.redirect(`/members?type=${member ? member.type : 'member'}&msg=Member deleted permanently`);
        } catch (err) {
            console.error(err);
            res.status(500).send("Error deleting member");
        }
    }
};

module.exports = MemberController;
