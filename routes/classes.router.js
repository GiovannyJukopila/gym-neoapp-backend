const express = require('express');
const {
  getAllClasses,
  getClass,
  getTrainers,
  createClass,
  updateClass,
  deleteClass,
} = require('../controllers/classController');

const router = express.Router();

router.get('/getall', getAllClasses);

router.get('/getTrainers/:gymId', getTrainers);

// router.get('/get/:id', getClass);

router.post('/create', createClass);

router.post('/update', updateClass);

router.delete('/delete/:classId', deleteClass);

module.exports = router;
