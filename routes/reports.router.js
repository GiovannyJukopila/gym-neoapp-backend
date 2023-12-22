const express = require('express');
const {
  generateGlobalReport,
  generateReportByMembership,
  generateDailyReport,
} = require('../controllers/reportsController');

const router = express.Router();

router.post('/generateGlobalReport', generateGlobalReport);
router.post('/generateReportByMembership', generateReportByMembership);
router.get('/generateDailyReport/:gymId', generateDailyReport);

module.exports = router;
