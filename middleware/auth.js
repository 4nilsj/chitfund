const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        res.locals.user = req.session.user; // Make user available to all views
        return next();
    }
    res.redirect('/login');
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.userType === 'admin') {
        return next();
    }
    res.status(403).send("Unauthorized: Admin access required");
};

const canWrite = (req, res, next) => {
    if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'manager')) {
        return next();
    }
    // If it's an AJAX/API request (starts with /api or accepts json), return 403 JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1) || req.path.startsWith('/api')) {
        return res.status(403).json({ error: "Unauthorized: Read-only access" });
    }
    // Otherwise redirect with error message
    res.status(403).send("Unauthorized: Read-only access");
};

module.exports = { isAuthenticated, isAdmin, canWrite };
