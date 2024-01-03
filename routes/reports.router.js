const express = require('express');
const {
  generateGlobalReport,
  generateReportByMembership,
  generateDailyReport,
} = require('../controllers/reportsController');
const verifyToken = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/generateGlobalReport', generateGlobalReport);
router.post('/generateReportByMembership', generateReportByMembership);
router.post('/generateDailyReport/:gymId', verifyToken, generateDailyReport);

module.exports = router;
