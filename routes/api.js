const express = require('express');
const router = express.Router();
const { calculateMonthlyObligation } = require('../utils/helpers');

// Get monthly obligation
router.get('/monthly-obligation/:memberId/:month', async (req, res) => {
    try {
        const { memberId, month } = req.params;
        const obligation = await calculateMonthlyObligation(memberId, month);
        res.json(obligation);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error calculating obligation' });
    }
});

module.exports = router;
