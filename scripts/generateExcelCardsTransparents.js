const qrcode = require('qrcode');
const admin = require('firebase-admin');
const { db } = require('../firebase'); // Asegúrate de reemplazar con la ruta correcta a tu archivo de configuración de Firebase

async function generarTarjetas(gymId, cantidad) {
  const gymRef = db.collection('gyms').doc(gymId);
  const gymSnapshot = await gymRef.get();

  if (!gymSnapshot.exists) {
    console.error('Gimnasio no encontrado');
    return;
  }

  const lastSerialNumber = gymSnapshot.data().prepaidCardLastSerialNumber || 0;
  const updatedSerialNumber = lastSerialNumber + cantidad;

  const cardsBatch = db.batch();

  for (let i = 0; i < cantidad; i++) {
    const serialNumber = `NMP-TEST-${(lastSerialNumber + i)
      .toString()
      .padStart(3, '0')}`;

    const qrCodeText = serialNumber;

    // Utilizar qrcode.toDataURL directamente para generar la imagen del código QR con las opciones personalizadas
    const qrCodeImage = await qrcode.toDataURL(qrCodeText);

    const cardData = {
      qrImage: qrCodeImage,
      cardStatus: 'inactive',
      gymId: gymId,
      cardSerialNumber: serialNumber,
      prepaidCard: true,
    };

    // Establecer el ID del documento como el cardSerialNumber
    const cardRef = db.collection('cards').doc(serialNumber);
    cardsBatch.set(cardRef, cardData);
  }

  // Actualizar lastSerialNumber en el documento de gimnasio
  await gymRef.update({ prepaidCardLastSerialNumber: updatedSerialNumber });

  await cardsBatch.commit();
}

// Ejemplo de uso:
const gymId = 'gym-test';
const cantidadTarjetas = 19;

generarTarjetas(gymId, cantidadTarjetas)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
