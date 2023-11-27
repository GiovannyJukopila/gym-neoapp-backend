const express = require('express');
const router = express.Router();
const {
  getTotalMembers,
  getCurrentMembersByMemberships,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
} = require('../controllers/dashboardController');

router.get('/getTotalMembers/:gymId', getTotalMembers);
router.get(
  '/getCurrentMembersByMemberships/:gymId',
  getCurrentMembersByMemberships
);
router.get('/getCheckInReports/:gymId', getCheckInReport);

router.get('/getPaymentReport/:gymId', getPaymentReport);

router.get('/getGuestReport/:gymId', getGuestReport);
module.exports = router;
