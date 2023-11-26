const express = require('express');
const router = express.Router();
const {
  createGuest,
  getAllGuests,
  getGuest,
  updateGuest,
} = require('../controllers/guestsController');

router.get('/get/all', getAllGuests);
router.get('/guests/:id', getGuest);
router.post('/createGuest', createGuest);

router.post('/guest/:guestId', updateGuest);

module.exports = router;
