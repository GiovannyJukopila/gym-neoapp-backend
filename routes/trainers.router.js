const express = require('express');
const router = express.Router();
const {
  createTrainer,
  getTrainers,
  searchTrainer,
} = require('../controllers/trainersController');

router.post('/createTrainer', createTrainer);
router.get('/get/all', getTrainers);
router.get('/search', searchTrainer);

module.exports = router;
