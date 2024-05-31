const express = require('express');
const router = express.Router();
const {
  addClassUnknownParticipants,
  addClassParticipants,
  getUnknownMemberClassesByProfileId,
  getmemberClassesByProfileId,
  getUnknownMemberCourtsByProfileId,
} = require('../controllers/userInterfaceController');
const verifyToken = require('../middlewares/authMiddleware');

router.post(
  '/addClassUnknownParticipants',
  verifyToken,
  addClassUnknownParticipants
);
router.post('/addClassParticipants', verifyToken, addClassParticipants);
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

module.exports = router;
