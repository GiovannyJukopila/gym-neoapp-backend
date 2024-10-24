const express = require('express');
const router = express.Router();
const {
  getConnection,
} = require('../controllers/internetConnectionController');

router.get('/getConnection', getConnection);

module.exports = router;
