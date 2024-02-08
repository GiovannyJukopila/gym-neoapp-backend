const express = require('express');
const {
  generateGlobalReport,
  generateReportByMembership,
  generateDailyReport,
  generateExpirationReport,
  generateActiveMembersReport,
  generateInactiveMembersReport,
} = require('../controllers/reportsController');
const verifyToken = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/generateGlobalReport', generateGlobalReport);
router.post('/generateReportByMembership', generateReportByMembership);
router.post('/generateDailyReport/:gymId', verifyToken, generateDailyReport);
router.get(
  '/generateActiveMembersReport/:gymId',
  verifyToken,
  generateActiveMembersReport
);
router.get(
  '/generateInactiveMembersReport/:gymId',
  verifyToken,
  generateInactiveMembersReport
);
router.post(
  '/generateExpirationReport/:gymId',
  verifyToken,
  generateExpirationReport
);

module.exports = router;
