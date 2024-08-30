const express = require('express');
const {
  getAllClasses,
  getClass,
  getAllprimaryClasses,
  getTodaysClasses,
  getTrainers,
  getWeekClasses,
  changeMemberAttendanceStatus,
  addParticipants,
  addUnknownParticipants,
  createClass,
  createPrimaryClasses,
  updateClass,
  updateAllClasses,
  updatePrimaryClasses,
  generateClassReport,
  deleteClass,
  deletePrimaryClass,
  deleteAllClasses,
  removeParticipant,
  removeUnknownParticipant,
  cancelClass,
} = require('../controllers/classController');
const verifyToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/getall', verifyToken, getAllClasses);

router.get('/getAllprimaryClasses', verifyToken, getAllprimaryClasses);

router.get('/getTrainers/:gymId', verifyToken, getTrainers);

router.get('/todaysClasses/:gymId', verifyToken, getTodaysClasses);

router.get('/getWeekClasses/:gymId', verifyToken, getWeekClasses);

// router.get('/get/:id', getClass);
router.post(
  '/changeMemberAttendanceStatus',
  verifyToken,
  changeMemberAttendanceStatus
);

router.post('/addParticipants', verifyToken, addParticipants);

router.post('/addUnknownParticipants', verifyToken, addUnknownParticipants);

router.post('/create', verifyToken, createClass);

router.post('/createPrimaryClasses', verifyToken, createPrimaryClasses);

router.post('/update', verifyToken, updateClass);

router.post('/updateAllClasses', verifyToken, updateAllClasses);

router.post('/updatePrimaryClasses', verifyToken, updatePrimaryClasses);

router.post('/generateClassReport/:gymId', verifyToken, generateClassReport);

router.post('/cancelClass', verifyToken, cancelClass);

router.post('/removeParticipant', verifyToken, removeParticipant);

router.post('/removeUnknownParticipant', verifyToken, removeUnknownParticipant);

router.post('/deletePrimaryClass/:classId', verifyToken, deletePrimaryClass);

router.delete('/delete/:classId', verifyToken, deleteClass);

router.delete(
  '/deleteAllClasses/:personalClassId',
  verifyToken,
  deleteAllClasses
);

module.exports = router;
