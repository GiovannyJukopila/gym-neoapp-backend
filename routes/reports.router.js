const express = require('express');
const {
  generateGlobalReport,
  generateReportByMembership,
} = require('../controllers/reportsController');

const router = express.Router();

router.post('/generateGlobalReport', generateGlobalReport);
router.post('/generateReportByMembership', generateReportByMembership);

module.exports = router;
