const express = require('express');
const {
  getAllMemberships,
  getMembership,
  getUsersByMonthForMembership,
  getTotalUsersByMonth,
  updateTotalUsersByMonth,
  createMembership,
  updateMembership,
  deleteMembership,
} = require('../controllers/membershipController');

const router = express.Router();

router.get('/getall', getAllMemberships);

router.get('/get/:id', getMembership);

router.get('/:membershipId/users-by-month', getUsersByMonthForMembership);

router.get('/getTotalUsersByMonth/:gymId', getTotalUsersByMonth);

router.get('/updateTotalUsersByMonth/:gymId', updateTotalUsersByMonth);

router.post('/create', createMembership);

router.post('/update', updateMembership);

router.delete('/delete/:membershipId', deleteMembership);

module.exports = router;
