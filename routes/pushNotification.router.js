const express = require('express');
const router = express.Router();
const {
  addSubscription,
  removeSubscription,
  getTestNotification,
  sendTestNotificationToUser,
} = require('../controllers/pushNotificationController');

// Ruta para agregar una suscripción desde el frontend
router.post('/subscribe', addSubscription);

// Ruta para eliminar una suscripción
router.post('/unsubscribe', removeSubscription);

// Ruta para enviar una notificación de prueba a todos los suscriptores
router.post('/send-test-notification', sendTestNotificationToUser);

// Ruta para enviar una notificación a un usuario específico
router.post('/send-notification', getTestNotification);

module.exports = router;
