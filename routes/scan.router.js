const express = require('express');
const { scanMember } = require('../controllers/scanController');

const router = express.Router();

router.get('/getMember/:cardSerialNumber', scanMember);

module.exports = router;
