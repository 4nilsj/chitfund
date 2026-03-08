const express = require('express');
const router = express.Router();
const TransactionController = require('../controllers/transactionController');
const { isAdmin, canWrite } = require('../middleware/auth');
const { validateTransaction } = require('../middleware/validators');

// Transactions List
router.get('/', TransactionController.list);

// Add Generic Transaction
router.post('/add', canWrite, validateTransaction, TransactionController.add);

// Bulk Add Contributions
router.post('/bulk-add', canWrite, TransactionController.bulkAdd);

// Delete Transaction (Admin Only)
router.post('/delete/:id', isAdmin, TransactionController.delete);

// View Transaction Details (Receipt)
router.get('/:id', TransactionController.detail);

// Download Transaction Receipt PDF
router.get('/:id/receipt', TransactionController.downloadReceipt);

module.exports = router;
