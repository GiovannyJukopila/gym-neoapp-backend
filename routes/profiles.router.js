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

router.post('/update', updateProfile);

router.post('/uploadFile', upload.single('profileFile'), uploadFile);

router.post('/freeze-membership', freezeMembership);

router.post('/unfreeze-membership', unfreezeMembership);

router.post('/checkCardAvailability', checkCardAvailability);

router.post('/checkCardForUpdated', checkCardForUpdated);

router.post('/updateProfileEndDate/:profileId', updateProfileEndDate);

router.delete('/deleteFile', deleteFile);

module.exports = router;
