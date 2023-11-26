const { db } = require('../firebase');

async function updateGymIdForEmptyCards(numToUpdate, newGymId) {
  try {
    const cardsRef = db.collection('cards');
    const query = cardsRef.where('gymId', '==', '');

    const querySnapshot = await query.get();
    let count = 0;

    querySnapshot.forEach((doc) => {
      if (count < numToUpdate) {
        const cardRef = cardsRef.doc(doc.id);
        cardRef.update({ gymId: newGymId });
        count++;
      }
    });

    console.log(`Se actualizaron ${count} documentos con el nuevo gymId.`);
  } catch (error) {
    console.error('Error al actualizar los documentos:', error);
  }
}

// Llama a la función para actualizar los documentos
updateGymIdForEmptyCards(2, 'nuevoGymId');
