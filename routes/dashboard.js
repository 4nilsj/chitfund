const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { formatCurrency } = require('../utils/helpers');

const { getDashboardData } = require('../services/dashboardService');

// Dashboard Route
router.get('/', async (req, res) => {
    try {
        const data = await getDashboardData(req.session.user, res.locals.fundName, req.query);
        data.formatCurrency = formatCurrency;
        res.render('dashboard', data);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading dashboard");
    }
});

// Real-Time Dashboard Stats API
router.get('/stats', async (req, res) => {
    try {
        const data = await getDashboardData(req.session.user, res.locals.fundName, req.query);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Error loading dashboard stats" });
    }
});


// Export Full Data (Backup)
router.get('/export', async (req, res) => {
    try {
        const members = await db.all("SELECT * FROM members");
        const loans = await db.all("SELECT * FROM loans");
        const transactions = await db.all("SELECT * FROM transactions");
        const settings = await db.all("SELECT * FROM settings");

        const backup = {
            exportDate: new Date().toISOString(),
            members,
            loans,
            transactions,
            settings
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="ChitFund_Full_Backup.json"');
        res.send(JSON.stringify(backup, null, 4));
    } catch (err) {
        console.error(err);
        res.status(500).send("Error exporting data");
    }
});

// Monthly Collection Details Breakdown
router.get('/collection-details', async (req, res) => {
    try {
        const userType = req.session.user.userType;
        const memberId = req.session.user.memberId;
        const isMember = userType === 'member';

        const now = new Date();
        const currentMonth = now.toISOString().slice(0, 7);

        // Fetch detailed transactions for the current month
        let query = `
            SELECT t.*, m.name as member_name 
            FROM transactions t 
            LEFT JOIN members m ON t.member_id = m.id 
            WHERE t.type IN ('contribution', 'repayment', 'penalty') 
            AND t.date LIKE ?
        `;
        let params = [`${currentMonth}%`];

        if (isMember) {
            query += " AND t.member_id = ?";
            params.push(memberId);
        }

        query += " ORDER BY t.date DESC, t.id DESC";

        const collections = await db.all(query, params);

        res.json({
            success: true,
            collections,
            currentMonth: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Error fetching collection details" });
    }
});

module.exports = router;
