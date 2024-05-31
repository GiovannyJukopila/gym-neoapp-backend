const { db } = require('../firebase');
const admin = require('firebase-admin');
const cardsRef = admin.firestore().collection('cards');

// Función para actualizar el estado de las tarjetas dentro del rango especificado
async function updateCardsStatus() {
  try {
    // Realiza una consulta para obtener los documentos dentro del rango especificado
    const snapshot = await cardsRef
      .where(admin.firestore.FieldPath.documentId(), '>=', '24-GYM-1-001')
      .where(admin.firestore.FieldPath.documentId(), '<=', '24-GYM-1-999')
      .get();

    // Actualiza el estado de cada documento encontrado
    const batch = admin.firestore().batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, { cardStatus: 'inactive' });
    });

    // Ejecuta la operación de actualización en lote
    await batch.commit();

    console.log('Tarjetas actualizadas exitosamente.');
  } catch (error) {
    console.error('Error al actualizar las tarjetas:', error);
  }
}

// Llama a la función para actualizar el estado de las tarjetas
updateCardsStatus();
