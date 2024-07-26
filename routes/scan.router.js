const express = require('express');
const {
  scanMember,
  markClassMemberAttendance,
} = require('../controllers/scanController');

const router = express.Router();

router.get('/getMember/:cardSerialNumber', scanMember);
router.get(
  '/markClassMemberAttendance/:profileId/:classId',
  markClassMemberAttendance
);

module.exports = router;
