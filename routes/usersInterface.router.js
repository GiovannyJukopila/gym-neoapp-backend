const express = require('express');
const router = express.Router();
const {
  getUserPenalties,
  addClassUnknownParticipants,
  addClassParticipants,
  addToUnknownMemberWaitingList,
  addToMemberWaitingList,
  cancelMemberClass,
  cancelMemberCourt,
  getUnknownMemberClassesByProfileId,
  getmemberClassesByProfileId,
  getUnknownMemberCourtsByProfileId,
  getmemberCourtsByProfileId,
  payPenalty,
  updatePenaltyStatus,
} = require('../controllers/userInterfaceController');
const verifyToken = require('../middlewares/authMiddleware');

router.get('/getUserPenalties/:profileId', verifyToken, getUserPenalties);

router.post(
  '/addClassUnknownParticipants',
  verifyToken,
  addClassUnknownParticipants
);
router.post('/addClassParticipants', verifyToken, addClassParticipants);
router.post(
  '/addToUnknownMemberWaitingList',
  verifyToken,
  addToUnknownMemberWaitingList
);
router.post('/addToMemberWaitingList', verifyToken, addToMemberWaitingList);
router.post('/cancelMemberClass', verifyToken, cancelMemberClass);

router.post(
  '/getUnknownMemberClassesByProfileId',
  verifyToken,
  getUnknownMemberClassesByProfileId
);
router.post(
  '/getmemberClassesByProfileId',
  verifyToken,
  getmemberClassesByProfileId
);
router.post(
  '/getUnknownMemberCourtsByProfileId',
  verifyToken,
  getUnknownMemberCourtsByProfileId
);
router.post(
  '/getmemberCourtsByProfileId',
  verifyToken,
  getmemberCourtsByProfileId
);
router.post('/penalties/pay', verifyToken, payPenalty);

router.patch('/penalties/updateStatus', verifyToken, updatePenaltyStatus);

router.delete('/cancelMemberCourt', verifyToken, cancelMemberCourt);

module.exports = router;
