const admin = require('firebase-admin');
const serviceAccount = require('./cred.json'); // Reemplaza con la ruta a tu archivo de configuración de Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://qr-test-399de-default-rtdb.firebaseio.com', // Reemplaza con la URL de tu proyecto Firebase
});

const firestore = admin.firestore();

async function actualizarProfilesConCampo() {
  try {
    // Consulta todos los documentos en la colección "profiles"
    const profilesQuerySnapshot = await firestore.collection('profiles').get();

    // Itera a través de los documentos y agrega el campo 'profileFileWasUpload' si no existe
    profilesQuerySnapshot.forEach(async (profileDoc) => {
      const profileData = profileDoc.data();
      if (!profileData.hasOwnProperty('profileFileWasUpload')) {
        await profileDoc.ref.update({ profileFileWasUpload: false });
        console.log(`Se agregó profileFileWasUpload a ${profileDoc.id}`);
      }
    });

    console.log('Campos actualizados exitosamente en la colección "profiles".');
  } catch (error) {
    console.error('Error al actualizar campos:', error);
  }
}

// Llama a la función para actualizar los campos en la colección "profiles"
actualizarProfilesConCampo();
