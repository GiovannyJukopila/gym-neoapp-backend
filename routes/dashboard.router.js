const express = require('express');
const router = express.Router();
const {
  getTotalMembers,
  getCurrentMembersByMemberships,
} = require('../controllers/dashboardController');

router.get('/getTotalMembers/:gymId', getTotalMembers);
router.get(
  '/getCurrentMembersByMemberships/:gymId',
  getCurrentMembersByMemberships
);

module.exports = router;
