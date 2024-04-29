const express = require('express');
const {
  getAllClasses,
  getClass,
  getTodaysClasses,
  getTrainers,
  addParticipants,
  addUnknownParticipants,
  createClass,
  updateClass,
  deleteClass,
  deleteAllClasses,
  removeParticipant,
  removeUnknownParticipant,
  cancelClass,
} = require('../controllers/classController');
const verifyToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/getall', verifyToken, getAllClasses);

router.get('/getTrainers/:gymId', verifyToken, getTrainers);

router.get('/todaysClasses/:gymId', verifyToken, getTodaysClasses);

// router.get('/get/:id', getClass);

router.post('/addParticipants', verifyToken, addParticipants);

router.post('/addUnknownParticipants', verifyToken, addUnknownParticipants);

router.post('/create', verifyToken, createClass);

router.post('/update', verifyToken, updateClass);

router.post('/cancelClass', verifyToken, cancelClass);

router.post('/removeParticipant', verifyToken, removeParticipant);

router.post('/removeUnknownParticipant', verifyToken, removeUnknownParticipant);

router.delete('/delete/:classId', verifyToken, deleteClass);

router.delete(
  '/deleteAllClasses/:personalClassId',
  verifyToken,
  deleteAllClasses
);

module.exports = router;
