const webpush = require('web-push');
const admin = require('firebase-admin');
const db = admin.firestore();

// Configura las claves VAPID
const vapidKeys = {
  publicKey:
    'BJYYrdp8EOKg8r2fr_52xlycTFxcCz50cqayn6FmNDhDJWBiN_mQV6K7K-eKLS2P1fxgcjhXQu8cQ7lixqxGZQY',
  privateKey: '3teF5WHPdFFCut3LaAg8E9HSp8NrhX3Nftt1wOpXfDs',
};

webpush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Función para añadir o actualizar la suscripción en Firestore
const addSubscription = async (req, res) => {
  const { subscription, profileId } = req.body;

  try {
    const profileRef = db.collection('profiles').doc(profileId);

    // Actualiza o añade la suscripción en el documento del perfil
    await profileRef.set(
      {
        pushSubscription: subscription, // Almacena la suscripción
      },
      { merge: true }
    );

    res.status(201).json({ message: 'Suscripción añadida o actualizada.' });
  } catch (error) {
    console.error('Error al añadir suscripción:', error);
    res.status(500).json({ message: 'Error al añadir suscripción.' });
  }
};

// Función para eliminar la suscripción en Firestore
const removeSubscription = async (req, res) => {
  const { profileId } = req.body;

  try {
    const profileRef = db.collection('profiles').doc(profileId);

    // Elimina el campo de suscripción
    await profileRef.update({
      pushSubscription: admin.firestore.FieldValue.delete(),
    });

    res.status(200).json({ message: 'Suscripción eliminada.' });
  } catch (error) {
    console.error('Error al eliminar suscripción:', error);
    res.status(500).json({ message: 'Error al eliminar suscripción.' });
  }
};

// Función para enviar una notificación push a un usuario específico
const sendNotification = async (profileId, payload) => {
  try {
    const profileRef = db.collection('profiles').doc(profileId);
    const doc = await profileRef.get();

    if (doc.exists && doc.data().pushSubscription) {
      const subscription = doc.data().pushSubscription;

      await webpush.sendNotification(subscription, JSON.stringify(payload));
      console.log('Notificación enviada correctamente.');
    } else {
      console.log(
        'No se encontró la suscripción o perfil para el profileId proporcionado.'
      );
    }
  } catch (error) {
    console.error('Error enviando notificación:', error);
  }
};

// Función para enviar una notificación de prueba a todos los suscriptores
const getTestNotification = async () => {
  const payload = {
    title: 'Test Notificación',
    message: 'Esta es una notificación de prueba.',
  };

  try {
    const profilesSnapshot = await db
      .collection('profiles')
      .where('pushSubscription', '!=', null)
      .get();

    const sendNotifications = profilesSnapshot.docs.map((doc) => {
      const subscription = doc.data().pushSubscription;

      return webpush
        .sendNotification(subscription, JSON.stringify(payload))
        .catch((error) => {
          if (error.statusCode === 410 || error.statusCode === 404) {
            // Eliminar la suscripción caducada o inválida de Firestore
            return doc.ref.update({
              pushSubscription: admin.firestore.FieldValue.delete(),
            });
          } else {
            console.error('Error enviando notificación:', error);
          }
        });
    });

    await Promise.all(sendNotifications);
    console.log('Notificación de prueba enviada correctamente.');
  } catch (error) {
    console.error('Error al enviar notificaciones de prueba:', error);
  }
};

// Ejemplo de uso: Envía una notificación de prueba a un usuario específico
const sendTestNotificationToUser = async (profileId) => {
  const payload = {
    title: 'Hola!',
    message: 'Esta es una notificación enviada solo a ti.',
  };
  await sendNotification(profileId, payload);
};

module.exports = {
  addSubscription,
  removeSubscription,
  getTestNotification,
  sendTestNotificationToUser,
};
