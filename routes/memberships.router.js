const express = require('express');
const {
  getAllMemberships,
  getMembership,
  getUsersByMonthForMembership,
  getTotalUsersByMonth,
  generateMembershipsReport,
  createMembership,
  updateMembership,
  deleteMembership,
} = require('../controllers/membershipController');
const verifyToken = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/getall', getAllMemberships);

router.get('/get/:id', getMembership);

router.get('/:membershipId/users-by-month', getUsersByMonthForMembership);

router.get('/getTotalUsersByMonth/:gymId', getTotalUsersByMonth);

router.post(
  '/generateMembershipsReport/:gymId',
  verifyToken,
  generateMembershipsReport
);

router.post('/create', createMembership);

router.post('/update', updateMembership);

router.delete('/delete/:membershipId', deleteMembership);

module.exports = router;
