const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdmin } = require('../middleware/auth');
const bcrypt = require('bcrypt');

// List Users
router.get('/', isAdmin, async (req, res) => {
    try {
        const users = await db.all("SELECT id, username, role FROM users ORDER BY id ASC");
        res.render('users', {
            user: req.session.user,
            activePage: 'users',
            users: users,
            msg: req.query.msg,
            error: req.query.error,
            fundName: res.locals.fundName
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error loading users");
    }
});

// Add User
router.post('/add', isAdmin, async (req, res) => {
    const { username, password, role } = req.body;
    try {
        if (!username || !password || !role) {
            return res.redirect('/users?error=All fields are required');
        }

        // Check duplicate
        const existing = await db.get("SELECT id FROM users WHERE username = ?", [username]);
        if (existing) {
            return res.redirect('/users?error=Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, hashedPassword, role]);

        res.redirect('/users?msg=User added successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding user");
    }
});

// Delete User
router.post('/delete/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        // Prevent deleting self
        if (parseInt(id) === req.session.user.id) {
            return res.redirect('/users?error=Cannot delete your own account');
        }

        // Prevent deleting the last admin? (Optional but good practice)
        // For simplicity, just allow.

        await db.run("DELETE FROM users WHERE id = ?", [id]);
        res.redirect('/users?msg=User deleted successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting user");
    }
});

// Change Own Password
router.post('/change-password', async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    const userId = req.session.user.id;

    if (new_password !== confirm_password) {
        return res.redirect('/settings?error=New passwords do not match');
    }

    try {
        const user = await db.get("SELECT password_hash FROM users WHERE id = ?", [userId]);
        const match = await bcrypt.compare(current_password, user.password_hash);

        if (!match) {
            return res.redirect('/settings?error=Incorrect current password');
        }

        const newHash = await bcrypt.hash(new_password, 10);
        await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, userId]);

        res.redirect('/settings?msg=Password changed successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error changing password");
    }
});

// Admin Reset Password
router.post('/reset-password/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { new_password } = req.body;

    try {
        const newHash = await bcrypt.hash(new_password, 10);
        await db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, id]);
        res.redirect('/users?msg=User password reset successfully');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error resetting password");
    }
});

module.exports = router;
