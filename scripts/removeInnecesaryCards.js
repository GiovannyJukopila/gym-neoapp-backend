const admin = require('firebase-admin');
const { db } = require('../firebase');

async function deleteCardsInRange(startCardSerialNumber, endCardSerialNumber) {
  try {
    const cardsCollection = db.collection('cards');
    const snapshot = await cardsCollection
      .where('cardSerialNumber', '>=', startCardSerialNumber)
      .where('cardSerialNumber', '<=', endCardSerialNumber)
      .get();

    snapshot.forEach(async (doc) => {
      try {
        await doc.ref.delete();
        console.log(`Document with ID ${doc.id} successfully deleted.`);
      } catch (error) {
        console.error(`Error deleting document: ${error}`);
      }
    });
  } catch (error) {
    console.error('Error getting documents:', error);
  }
}

// Luego puedes llamar a esta función con los rangos deseados
const startCardSerialNumber = 'NMP-MAR-101';
const endCardSerialNumber = 'NMP-MAR-200';

deleteCardsInRange(startCardSerialNumber, endCardSerialNumber);
