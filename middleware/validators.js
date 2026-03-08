const { body, validationResult } = require('express-validator');

// ── Helper: 90-day Date Range Validator ─────────────────────────────────────
// Returns a custom validator that:
//  - Rejects dates more than 90 days in the past
//  - Rejects dates more than 1 day in the future (timezone buffer)
const dateRangeValidator = body('date')
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
        const inputDate = new Date(value);
        const now = new Date();
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(now.getDate() - 90);
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);

        if (inputDate < ninetyDaysAgo) {
            throw new Error('Transaction date cannot be more than 90 days in the past');
        }
        if (inputDate > tomorrow) {
            throw new Error('Transaction date cannot be in the future');
        }
        return true;
    });

// Validation Rules
const validateMember = [
    body('name').trim().notEmpty().withMessage('Name is required').escape(),
    body('type').isIn(['member', 'public']).withMessage('Invalid member type'),
    body('contact').optional({ checkFalsy: true }).isNumeric().withMessage('Contact must be numeric').isLength({ min: 10, max: 15 }).withMessage('Contact must be 10-15 digits')
];

const validateTransaction = [
    body('person_id').custom((value, { req }) => {
        const type = req.body.type || '';
        if (['contribution', 'repayment', 'disbursement'].includes(type)) {
            if (!value || value.toString().trim() === '') {
                throw new Error('Associated Person is required for this transaction type');
            }
        }
        if (value && value.toString().trim() !== '' && isNaN(parseInt(value))) {
            throw new Error('Invalid Member ID');
        }
        return true;
    }),
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be positive'),
    dateRangeValidator, // 90-day backdating limit + no future dates
    body('type').isIn(['contribution', 'repayment', 'expense', 'penalty', 'disbursement']).withMessage('Invalid Transaction Type'),
    body('remarks').optional().trim().escape()
];

const validateLoan = [
    body('member_id').isInt().withMessage('Invalid Member ID'),
    body('amount').isFloat({ min: 100 }).withMessage('Loan amount too small'),
    body('rate').isFloat({ min: 0, max: 100 }).withMessage('Rate must be 0-100'),
    body('tenure').isInt({ min: 1 }).withMessage('Tenure must be at least 1 month'),
    body('start_date').isISO8601().withMessage('Invalid Start Date')
];

const validateRepayment = [
    body('loan_id').isInt().withMessage('Invalid Loan ID'),
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be positive'),
    dateRangeValidator, // 90-day backdating limit + no future dates
    body('month_for').trim().notEmpty().withMessage('Month For is required')
];

// Helper to check results
const checkValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0].msg;
        // Determine where to redirect based on URL or defaults
        // This is tricky as generic middleware needs context.
        // For now, let's attach errors to req and let controller handle?
        // OR simply redirect back with generic query param.
        // Better: We'll modify the controller to call `validationResult`.
        // BUT strict plan says "reject immediately".
        // I will return 400 if API, but this is MVC.
        // I'll attach `req.validationErrors = errors`?
        // No, `validationResult` is available in controller.
        // I will just export the rules.
    }
    next();
};

module.exports = {
    validateMember,
    validateTransaction,
    validateLoan,
    validateRepayment
};
