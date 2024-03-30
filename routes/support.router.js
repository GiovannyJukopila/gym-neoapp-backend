const express = require('express');
const router = express.Router();
const { sendSupportNotification } = require('../controllers/supportController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/sendSupportNotification', verifyToken, sendSupportNotification);

module.exports = router;
