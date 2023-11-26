const express = require('express');
const {
  getGym,
  updateAdminSettings,
  updateGymInfo,
  uploadGymLogo,
  deleteGymLogo,
} = require('../controllers/gymsController');
const multer = require('multer');

const storage = multer.memoryStorage(); // Almacena el archivo en memoria
const upload = multer({ storage: storage });
const router = express.Router();

router.get('/getgym/:id', getGym);
router.post('/update-gym/:gymId', updateAdminSettings);
router.post('/update-gyminfo/:gymId', updateGymInfo);
router.post('/uploadGymLogo', upload.single('gymLogo'), uploadGymLogo);
router.delete('/deleteLogo', deleteGymLogo);

module.exports = router;
