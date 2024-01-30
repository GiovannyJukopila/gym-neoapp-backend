const express = require('express');
const {
  getAllClasses,
  getClass,
  getTrainers,
  addParticipants,
  createClass,
  updateClass,
  deleteClass,
  removeParticipant,
  cancelClass,
} = require('../controllers/classController');
const verifyToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/getall', verifyToken, getAllClasses);

router.get('/getTrainers/:gymId', verifyToken, getTrainers);

// router.get('/get/:id', getClass);

router.post('/addParticipants', verifyToken, addParticipants);

router.post('/create', verifyToken, createClass);

router.post('/update', verifyToken, updateClass);

router.post('/cancelClass', verifyToken, cancelClass);

router.post('/removeParticipant', verifyToken, removeParticipant);

router.delete('/delete/:classId', verifyToken, deleteClass);

module.exports = router;
