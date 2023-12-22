const admin = require('firebase-admin');
const serviceAccount = require('./cred.json'); // Reemplaza con la ruta a tu archivo de configuración de Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://qr-test-399de-default-rtdb.firebaseio.com', // Reemplaza con la URL de tu proyecto Firebase
});

const firestore = admin.firestore();
async function actualizarUsuariosConGymId() {
  try {
    // Obtén la referencia al gimnasio que deseas asignar a los usuarios
    const gimnasioRef = firestore.collection('gyms').doc('marriot-1'); // Reemplaza 'id_del_gimnasio' con el ID del gimnasio

    // Consulta todos los usuarios
    const usuariosQuerySnapshot = await firestore.collection('profiles').get();

    // Itera a través de los usuarios y asigna el campo 'gymId' solo si no existe
    usuariosQuerySnapshot.forEach(async (usuarioDoc) => {
      const usuarioData = usuarioDoc.data();
      if (!usuarioData.hasOwnProperty('gymId')) {
        await usuarioDoc.ref.update({ gymId: gimnasioRef });
      }
    });
  } catch (error) {
    console.error('Error al actualizar usuarios:', error);
  }
}

// Llama a la función para actualizar usuarios
actualizarUsuariosConGymId();
