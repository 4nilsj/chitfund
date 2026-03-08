const express = require('express');
const router = express.Router();
const MemberController = require('../controllers/memberController');
const { isAdmin, canWrite } = require('../middleware/auth');
const { validateMember } = require('../middleware/validators');

// Members List
router.get('/', MemberController.list);

// Add Member Action
router.post('/add', canWrite, ...validateMember, MemberController.create);

// Move Member to Public (Admin Only)
router.post('/move-to-public', isAdmin, MemberController.moveToPublic);

// Toggle Member Status (Admin Only)
router.post('/status/toggle', isAdmin, MemberController.toggleStatus);

// Edit Member Action
router.post('/edit/:id', canWrite, MemberController.update);

// Delete Member (Admin Only)
router.post('/delete/:id', isAdmin, MemberController.delete);

// View Member Passbook
router.get('/:id/passbook', MemberController.viewPassbook);

// View Member Details
router.get('/:id', MemberController.detail);

module.exports = router;
