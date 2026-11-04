const express = require('express');
const router = express.Router();
const {
  createAdmin,
  getAdmins,
  searchAdmin,
  getPermissions,
  getDeletePreview,
  deleteAdmin,
} = require('../controllers/adminsController');
const verifyToken = require('../middlewares/authMiddleware');
const { requireStaff, requireMaster } = require('../middlewares/staffAuth');

router.post('/createAdmin', createAdmin);
router.get('/get/all', getAdmins);
router.get('/search', searchAdmin);
router.get('/getPermissions/:profileId', verifyToken, getPermissions);

// Eliminar admins: solo un Master Admin
router.get(
  '/:profileId/delete-preview',
  requireStaff(),
  requireMaster,
  getDeletePreview
);
router.delete('/:profileId', requireStaff(), requireMaster, deleteAdmin);
module.exports = router;
