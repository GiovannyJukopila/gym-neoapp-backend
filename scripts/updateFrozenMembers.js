const { db } = require('../firebase');
const admin = require('firebase-admin');

// Definir una función asincrónica y llamarla inmediatamente
(async () => {
  const gymId = 'marriot-1';
  const profilesSnapshot = await admin
    .firestore()
    .collection('profiles')
    .where('gymId', '==', gymId)
    .where('role', '==', 'member')
    .get();

  const batch = admin.firestore().batch();
  profilesSnapshot.forEach((doc) => {
    const profileData = doc.data();
    const profileFrozen = profileData.profileFrozen;

    // Verificar si profileFrozen existe y es true
    if (profileFrozen !== undefined && profileFrozen === true) {
      const profileRef = admin.firestore().collection('profiles').doc(doc.id);

      // Actualizar el estado del perfil en el lote
      batch.update(profileRef, { profileStatus: false });
    }
  });

  // Ejecutar el lote de actualizaciones
  await batch.commit();
})();
