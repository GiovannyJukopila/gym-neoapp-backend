const express = require('express');
const router = express.Router();
const { getNotification } = require('../controllers/notificationController');

router.post('/sendEmail', getNotification);

module.exports = router;
