const express = require('express');
const router = express.Router();
const {
  addClassUnknownParticipants,
  addClassParticipants,
  cancelMemberClass,
  cancelMemberCourt,
  getUnknownMemberClassesByProfileId,
  getmemberClassesByProfileId,
  getUnknownMemberCourtsByProfileId,
  getmemberCourtsByProfileId,
} = require('../controllers/userInterfaceController');
const verifyToken = require('../middlewares/authMiddleware');

router.post(
  '/addClassUnknownParticipants',
  verifyToken,
  addClassUnknownParticipants
);
router.post('/addClassParticipants', verifyToken, addClassParticipants);
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
router.delete('/cancelMemberCourt', verifyToken, cancelMemberCourt);

module.exports = router;
