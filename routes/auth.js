const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// ── Login Rate Limiter ───────────────────────────────────────────────────────
// 10 failed attempts per IP per 15 minutes before locking out.
// Disabled in test mode so supertest auth tests are not rate-limited.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'test' ? 1000 : 10,
    standardHeaders: true,  // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins against limit
    handler: (req, res) => {
        // Render a user-friendly page instead of raw JSON
        res.status(429).render('error', {
            message: 'Too many login attempts. Please wait 15 minutes before trying again.',
            statusCode: 429,
            error: {}
        });
    }
});

// Login Page
router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Login Action
router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    try {
        // First, try admin login
        const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role,
                userType: user.role
            };
            return res.redirect('/');
        }

        // If admin login fails, try member login (mobile number + password "1234")
        const member = await db.get("SELECT * FROM members WHERE contact = ? AND status = 'active'", [username]);
        console.log('Member login attempt:', { username, password, memberFound: !!member });
        if (member && password === '1234') {
            req.session.user = {
                id: member.id,
                username: member.name,
                role: 'member',
                userType: 'member',
                memberId: member.id,
                memberType: member.type
            };
            return res.redirect('/');
        }

        res.render('login', { error: 'Invalid credentials' });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error logging in");
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

module.exports = router;
