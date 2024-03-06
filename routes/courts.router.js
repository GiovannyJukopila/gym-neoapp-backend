const express = require('express');
const {
  getAllCourts,
  getClass,
  getTrainers,
  addParticipants,
  createCourt,
  updateCourt,
  deleteCourt,
  removeParticipant,
  cancelClass,
} = require('../controllers/courtsController');
const verifyToken = require('../middlewares/authMiddleware');
const router = express.Router();

router.get('/getall', verifyToken, getAllCourts);
router.post('/create', verifyToken, createCourt);
router.post('/update', verifyToken, updateCourt);
router.delete('/delete/:id', verifyToken, deleteCourt);
module.exports = router;
