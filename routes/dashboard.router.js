const express = require('express');
const router = express.Router();
const {
  getTotalMembers,
  getCurrentMembersByMembershipsHandler,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
  setInactiveMembersHandler,
  updateTotalAmountByMonthHandler,
} = require('../controllers/dashboardController');
const verifyToken = require('../middlewares/authMiddleware');

router.get('/getTotalMembers/:gymId', getTotalMembers);
router.get(
  '/getCurrentMembersByMemberships/:gymId',
  getCurrentMembersByMembershipsHandler
);
router.get('/getCheckInReports/:gymId', getCheckInReport);

router.get('/getPaymentReport/:gymId', getPaymentReport);

router.get('/getGuestReport/:gymId', getGuestReport);

router.get('/updateTotalAmountByMonth/:gymId', updateTotalAmountByMonthHandler);

router.post('/updateInactiveMembers/:gymId', setInactiveMembersHandler);

module.exports = router;
