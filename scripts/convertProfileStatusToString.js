const { db } = require('../firebase');
const admin = require('firebase-admin');

// Obtener una referencia a la colección 'profiles'
const profilesRef = admin.firestore().collection('profiles');

// Función para actualizar los perfiles filtrando por gymId
async function updateProfilesByGymId(gymId) {
  try {
    // Obtener todos los perfiles para el gymId especificado
    const snapshot = await profilesRef.where('gymId', '==', gymId).get();

    // Iterar sobre cada perfil y actualizar el campo 'profileStatus'
    snapshot.forEach((doc) => {
      const profile = doc.data();
      const profileStatus = profile.profileStatus;

      // Verificar el valor de 'profileStatus' y convertirlo en string
      let updatedStatus;
      if (typeof profileStatus === 'boolean') {
        updatedStatus = profileStatus.toString();
      } else {
        // Si 'profileStatus' ya es un string, no es necesario modificarlo
        updatedStatus = profileStatus;
      }

      // Actualizar el campo 'profileStatus' en el documento actual
      doc.ref.update({ profileStatus: updatedStatus });
    });
  } catch (error) {
    console.error('Error al actualizar los perfiles:', error);
  }
}

// Llamar a la función para actualizar los perfiles filtrando por gymId
const gymId = 'marriot-1'; // Reemplazar 'ID_DEL_GYM' con el ID del gimnasio deseado
updateProfilesByGymId(gymId);
