const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdmin } = require('../middleware/auth');
const path = require('path');

// Protect all settings routes
router.use(isAdmin);

// GET Settings Page
router.get('/', async (req, res) => {
    try {
        // Fetch default contribution
        const defaultRaw = await db.get("SELECT value FROM settings WHERE key = 'default_contribution'");
        const defaultContribution = defaultRaw ? parseInt(defaultRaw.value) : 1000;

        // Fetch all overrides
        const overridesRaw = await db.all("SELECT key, value FROM settings WHERE key LIKE 'contribution_%'");
        const overrides = overridesRaw.map(row => ({
            month: row.key.replace('contribution_', ''),
            amount: parseInt(row.value)
        })).sort((a, b) => b.month.localeCompare(a.month));

        // Fetch opening balance
        const openingRaw = await db.get("SELECT value FROM settings WHERE key = 'opening_balance'");
        const openingBalance = openingRaw ? parseInt(openingRaw.value) : 0;
        const isOpeningBalanceSet = !!openingRaw;

        res.render('settings', {
            user: req.session.user,
            fundName: res.locals.fundName,
            activePage: 'settings',
            defaultContribution,
            overrides,
            openingBalance,
            isOpeningBalanceSet,
            msg: req.query.msg,
            type: req.query.type
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading settings");
    }
});

// Update Default
router.post('/contribution/default', async (req, res) => {
    const { amount } = req.body;
    try {
        const exists = await db.get("SELECT key FROM settings WHERE key = 'default_contribution'");
        if (exists) {
            await db.run("UPDATE settings SET value = ? WHERE key = 'default_contribution'", [amount]);
        } else {
            await db.run("INSERT INTO settings (key, value) VALUES ('default_contribution', ?)", [amount]);
        }
        res.redirect('/settings?msg=Global default updated successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating default");
    }
});

// Add/Update Override
router.post('/contribution/override', async (req, res) => {
    const { month, amount } = req.body;
    const key = `contribution_${month}`;
    try {
        const exists = await db.get("SELECT key FROM settings WHERE key = ?", [key]);
        if (exists) {
            await db.run("UPDATE settings SET value = ? WHERE key = ?", [amount, key]);
        } else {
            await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, amount]);
        }
        res.redirect('/settings?msg=Monthly override set successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error setting override");
    }
});

// Delete Override
router.post('/contribution/delete', async (req, res) => {
    const { month } = req.body;
    const key = `contribution_${month}`;
    try {
        await db.run("DELETE FROM settings WHERE key = ?", [key]);
        res.redirect('/settings?msg=Override removed.&type=warning');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error removing override");
    }
});

// Update Fund Name
router.post('/update-fund-name', async (req, res) => {
    const { fund_name } = req.body;
    try {
        const key = 'fund_name';
        const exists = await db.get("SELECT key FROM settings WHERE key = ?", [key]);
        if (exists) {
            await db.run("UPDATE settings SET value = ? WHERE key = ?", [fund_name, key]);
        } else {
            await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, fund_name]);
        }
        res.redirect('/settings?msg=Fund name updated successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating fund name");
    }
});


// Set Opening Balance
router.post('/opening-balance', async (req, res) => {
    const { amount } = req.body;
    try {
        const key = 'opening_balance';
        // Verify if it's already set (double check)
        const exists = await db.get("SELECT value FROM settings WHERE key = ?", [key]);

        if (exists) {
            // Usually this is one-time, but for flexibility we might allow update or check a flag
            // The UI says "You cannot change this later", so maybe we should block it?
            // For now, let's allow it to fix mistakes, or strictly follow logic.
            // Let's UPDATE it to be safe.
            await db.run("UPDATE settings SET value = ? WHERE key = ?", [amount, key]);
        } else {
            await db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, amount]);
        }
        res.redirect('/?msg=Opening balance set successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error setting opening balance");
    }
});

// Download Database Backup
router.get('/backup', (req, res) => {
    try {
        const dbPath = path.resolve(__dirname, '../chitfund.db');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `chitfund_backup_${timestamp}.db`;

        res.download(dbPath, filename, (err) => {
            if (err) {
                console.error("Backup download error:", err);
                // Can't send 500 if headers already sent, but usually download handles it
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating backup");
    }
});

module.exports = router;
