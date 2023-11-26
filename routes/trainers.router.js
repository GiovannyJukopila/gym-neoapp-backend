const express = require('express');
const router = express.Router();
const {
  createTrainer,
  getTrainers,
} = require('../controllers/trainersController');

router.post('/createTrainer', createTrainer);
router.get('/get/all', getTrainers);

module.exports = router;
