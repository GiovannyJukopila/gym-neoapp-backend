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

  const lastSerialNumber = gymSnapshot.data().lastSerialNumber || 0;
  const updatedSerialNumber = lastSerialNumber + cantidad;

  const cardsBatch = db.batch();

  for (let i = 0; i < cantidad; i++) {
    const serialNumber = `${new Date()
      .getFullYear()
      .toString()
      .slice(-2)}-MAR-${(lastSerialNumber + i).toString().padStart(3, '0')}`;

    const qrCodeText = serialNumber;

    // Utilizar qrcode.toDataURL directamente para generar la imagen del código QR
    const qrCodeImage = await qrcode.toDataURL(qrCodeText);

    const cardData = {
      qrImage: qrCodeImage,
      cardStatus: 'inactive',
      gymId: gymId,
      cardSerialNumber: serialNumber,
    };

    // Establecer el ID del documento como el cardSerialNumber
    const cardRef = db.collection('cards').doc(serialNumber);
    cardsBatch.set(cardRef, cardData);
  }

  // Actualizar lastSerialNumber en el documento de gimnasio
  await gymRef.update({ lastSerialNumber: updatedSerialNumber });

  await cardsBatch.commit();
}

// Ejemplo de uso:
const gymId = 'marriot-1';
const cantidadTarjetas = 0;

generarTarjetas(gymId, cantidadTarjetas)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
