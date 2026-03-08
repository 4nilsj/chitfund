const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const db = require('./config/database'); // Initialize DB
const app = express();

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server);

// Attach Socket.io to Express so routes can emit events
app.set('io', io);

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log('A client connected to the real-time dashboard');
    socket.on('disconnect', () => {
        console.log('Client disconnected from dashboard');
    });
});

const PORT = process.env.PORT || 3000;

// ── Security: enforce SESSION_SECRET in production ──
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is not set. Set it in your .env or server environment before starting.');
    process.exit(1);
}
const backupService = require('./services/backupService');

const path = require('path');

const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const csrf = require('csurf');

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disabled: app uses inline scripts/styles (Chart.js, FontAwesome CDN)
    crossOriginResourcePolicy: { policy: 'same-site' }, // Block cross-origin resource loading
    referrerPolicy: { policy: 'no-referrer-when-downgrade' }, // Referrer header policy
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY (clickjacking protection)
    noSniff: true, // X-Content-Type-Options: nosniff
    xssFilter: true // X-XSS-Protection header (legacy browsers)
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

// Session Setup
// In production SESSION_SECRET must be set (enforced above).
// In development/test a random secret is generated per-process (sessions won't survive restarts, which is fine locally).
const sessionSecret = process.env.SESSION_SECRET || require('crypto').randomUUID();
app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,              // Prevent JS access to session cookie
        sameSite: 'lax'              // CSRF defence for same-site requests
    }
}));

// ── CSRF Protection ──
// Disabled in test mode so supertest suites don't need to send CSRF tokens
const csrfProtection = process.env.NODE_ENV === 'test'
    ? (req, res, next) => next() // No-op in test
    : csrf({ cookie: false });   // Use session-based tokens (not cookies)

const csrfGlobalMiddleware = (req, res, next) => {
    // Skip CSRF globally for multipart endpoints where Multer must run first
    if (req.path === '/loans/repay' && req.method === 'POST') {
        return next();
    }
    return csrfProtection(req, res, next);
};

app.use(csrfGlobalMiddleware);

// Inject CSRF token & user into res.locals for every EJS view
app.use((req, res, next) => {
    // In test mode csrfToken fn is not attached — provide empty string
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    next();
});

// CSRF error handler — friendly redirect instead of raw 403
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).render('error', {
            message: 'Form session expired or invalid request.',
            statusCode: 403,
            error: {}
        });
    }
    next(err);
});

// Global Brand Middleware
app.use(async (req, res, next) => {
    try {
        const setting = await db.get("SELECT value FROM settings WHERE key = 'fund_name'");
        res.locals.fundName = setting ? setting.value : 'ChitFund Manager';
    } catch (e) {
        res.locals.fundName = 'ChitFund Manager';
    }
    next();
});

// Import Middleware
const { isAuthenticated } = require('./middleware/auth');

// Import Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const memberRoutes = require('./routes/members');
const loanRoutes = require('./routes/loans');
const transactionRoutes = require('./routes/transactions');
const paymentRoutes = require('./routes/payments');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

// Mount Routes
app.use('/', authRoutes); // Login/Logout

// Protected Routes
app.use('/', isAuthenticated, dashboardRoutes); // Dashboard at /
app.use('/dashboard', isAuthenticated, dashboardRoutes); // Alias for dashboard
app.use('/members', isAuthenticated, memberRoutes);
app.use('/loans', isAuthenticated, loanRoutes);
app.use('/transactions', isAuthenticated, transactionRoutes);
app.use('/payments', isAuthenticated, paymentRoutes);
app.use('/reports', isAuthenticated, reportRoutes);
app.use('/settings', isAuthenticated, settingsRoutes);
app.use('/admin', isAuthenticated, adminRoutes);
app.use('/api', isAuthenticated, apiRoutes);
app.use('/users', isAuthenticated, require('./routes/users'));

// 404 Handler
app.use((req, res, next) => {
    const error = new Error("Page Not Found");
    error.status = 404;
    next(error);
});

// Global Error Handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Start Server only if run directly
if (require.main === module) {
    db.init().then(() => {
        // Initialize Backup Service
        backupService.initBackupSchedule();

        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    });
}

module.exports = app;
