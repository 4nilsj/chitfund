const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdmin } = require('../middleware/auth');

// Reset Fund Route
router.post('/reset', isAdmin, async (req, res) => {
    try {
        console.log("Admin: Initiating Fund Reset...");
        await db.run("DELETE FROM transactions");
        await db.run("DELETE FROM loans");
        await db.run("DELETE FROM members");
        await db.run("DELETE FROM settings");

        try {
            await db.run("DELETE FROM sqlite_sequence WHERE name='members'");
            await db.run("DELETE FROM sqlite_sequence WHERE name='loans'");
            await db.run("DELETE FROM sqlite_sequence WHERE name='transactions'");
        } catch (e) {
            console.log("Could not reset sequences (tables might be empty)");
        }

        // Re-seed necessary settings if any (fund name?)
        await db.run("INSERT INTO settings (key, value) VALUES ('fund_name', 'ChitFund Manager')");

        console.log("Fund Reset Complete.");
        res.redirect('/?msg=Fund has been reset to factory state.&type=warning');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error resetting fund");
    }
});



// Deprecated/Legacy: Update Fund Name (Moved from settings for compatibility with some older tests)
router.post('/settings/fund-name', isAdmin, async (req, res) => {
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

module.exports = router;
