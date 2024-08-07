const express = require('express');
const router = express.Router();
const {
  getTotalMembers,
  getCurrentMembersByMemberships,
  getCheckInReport,
  getPaymentReport,
  getGuestReport,
  setInactiveMembers,
  updateTotalAmountByMonth,
} = require('../controllers/dashboardController');
const verifyToken = require('../middlewares/authMiddleware');

router.get('/getTotalMembers/:gymId', getTotalMembers);
router.get(
  '/getCurrentMembersByMemberships/:gymId',
  getCurrentMembersByMemberships
);
router.get('/getCheckInReports/:gymId', getCheckInReport);

router.get('/getPaymentReport/:gymId', getPaymentReport);

router.get('/getGuestReport/:gymId', getGuestReport);

router.get('/updateTotalAmountByMonth/:gymId', updateTotalAmountByMonth);

router.post('/updateInactiveMembers/:gymId', setInactiveMembers);

module.exports = router;
