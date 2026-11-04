const express = require('express');
const {
  getAllProfiles,
  getProfile,
  getCardDetail,
  searchProfile,
  getProfileByEmail,
  createProfile,
  updateProfile,
  uploadFile,
  freezeMembership,
  unfreezeMembership,
  checkCardAvailability,
  checkCardForUpdated,
  updateProfileEndDate,
  deleteFile,
  getProfileByName,
  searchByCardNumber,
  searchKnownMemberByCardNumber,
} = require('../controllers/profileController');
const multer = require('multer');
const verifyToken = require('../middlewares/authMiddleware');
const { requireStaff } = require('../middlewares/staffAuth');

// Los paneles antiguos aun abiertos no envian el token al renovar, congelar o
// descongelar: se aceptan mientras se actualizan (ver middlewares/staffAuth.js)
const staffOnly = requireStaff();
const staffOnlyDuringRollout = requireStaff({ allowMissingToken: true });

const storage = multer.memoryStorage(); // Almacena el archivo en memoria
const upload = multer({ storage: storage });

const { db } = require('../firebase');
const router = express.Router();
const serviceAccount = require('../cred.json');

router.get('/get/all', getAllProfiles);

router.get('/get/:id', getProfile);

router.get('/getCardDetail/:cardNumber', verifyToken, getCardDetail);

router.get('/search', searchProfile);

router.get('/searchByCardNumber', searchByCardNumber);

router.get('/searchKnownMemberByCardNumber', searchKnownMemberByCardNumber);

router.post('/get/getProfileByName', getProfileByName);

router.post('/get/profileByEmail', getProfileByEmail);

router.post('/create', createProfile);

router.post('/update', staffOnly, updateProfile);

router.post('/uploadFile', upload.single('profileFile'), uploadFile);

router.post('/freeze-membership', staffOnlyDuringRollout, freezeMembership);

router.post('/unfreeze-membership', staffOnlyDuringRollout, unfreezeMembership);

router.post('/checkCardAvailability', checkCardAvailability);

router.post('/checkCardForUpdated', checkCardForUpdated);

router.post(
  '/updateProfileEndDate/:profileId',
  staffOnlyDuringRollout,
  updateProfileEndDate
);

router.delete('/deleteFile', deleteFile);

module.exports = router;
