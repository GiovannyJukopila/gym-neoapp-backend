const express = require('express');
const router = express.Router();
const {
  createAdmin,
  getAdmins,
  searchAdmin,
} = require('../controllers/adminsController');

router.post('/createAdmin', createAdmin);
router.get('/get/all', getAdmins);
router.get('/search', searchAdmin);

module.exports = router;
