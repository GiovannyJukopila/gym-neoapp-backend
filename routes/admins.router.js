const express = require('express');
const router = express.Router();
const {
  createAdmin,
  getAdmins,
  searchAdmin,
  getPermissions,
} = require('../controllers/adminsController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/createAdmin', createAdmin);
router.get('/get/all', getAdmins);
router.get('/search', searchAdmin);
router.get('/getPermissions/:profileId', verifyToken, getPermissions);
module.exports = router;
