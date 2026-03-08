const errorHandler = (err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.url}:`, err);

    // Determine Status
    const statusCode = err.status || 500;

    // Determine Message
    const message = statusCode === 404
        ? "Page Not Found"
        : (process.env.NODE_ENV === 'production' ? "Internal Server Error" : err.message);

    const description = statusCode === 404
        ? "The page you are looking for might have been removed or is temporarily unavailable."
        : "We are experiencing technical difficulties. Please try again later.";

    // Render Error View
    res.status(statusCode).render('error', {
        statusCode,
        message,
        description,
        user: req.session ? req.session.user : null,
        activePage: 'error',
        fundName: res.locals.fundName || 'ChitFund'
    });
};

module.exports = errorHandler;
