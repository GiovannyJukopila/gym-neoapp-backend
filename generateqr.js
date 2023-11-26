const qrcode = require('qrcode');
const admin = require('firebase-admin');
const { db } = require('./firebase'); // Asegúrate de reemplazar con la ruta correcta a tu archivo de configuración de Firebase

async function generateAndSaveQRCodes() {
  const numberOfCodes = 5; // Número de códigos que deseas generar
  const collectionRef = admin.firestore().collection('profiles');
  const metadataRef = db.collection('metadata').doc('metadata'); // Documento de metadatos
  const lastProfileIdRef = db.collection('metadata').doc('lastProfileId');
  const lastSerialNumberRef = db.collection('metadata').doc('lastSerialNumber');

  // Obtén el último valor de "lastProfileId" desde el documento "metadata"
  const metadataSnapshot = await metadataRef.get();
  const metadataData = metadataSnapshot.data() || {};
  let lastProfileId = metadataData.lastProfileId || 0;

  const lastProfileIdSnapshot = await lastProfileIdRef.get();

  if (lastProfileIdSnapshot.exists) {
    lastProfileId = lastProfileIdSnapshot.data().value;
  }

  // Obtén el último profileSerialNumber utilizado
  const lastSerialNumberSnapshot = await lastSerialNumberRef.get();
  let lastSerialNumber = '23-MAR-0';

  if (lastSerialNumberSnapshot.exists) {
    lastSerialNumber = lastSerialNumberSnapshot.data().value;
  }

  function incrementSerialNumber(serialNumber) {
    const [dayMonth, month, number] = serialNumber.split('-');
    const newNumber = parseInt(number, 10) + 1;
    const newFormattedNumber = newNumber.toString().padStart(3, '0');

    return `${dayMonth}-${month}-${newFormattedNumber}`;
  }

  for (let i = 1; i <= numberOfCodes; i++) {
    lastProfileId++; // Incrementa el último profileId
    const qrData = `Profile-${lastProfileId}`;
    const qrCodeImage = await qrcode.toDataURL(qrData);

    // Incrementa el último profileSerialNumber y guárdalo
    lastSerialNumber = incrementSerialNumber(lastSerialNumber);
    await lastSerialNumberRef.set({ value: lastSerialNumber });

    const profileStatus = false;

    const newFields = {
      profileCode: qrData,
      profileImage: qrCodeImage,
      profileStatus: profileStatus,
      profileId: lastProfileId,
      profileSerialNumber: lastSerialNumber,
      gymId: 'marriot-1', // Usa el serial number calculado
      // Agrega aquí otros campos nuevos con sus valores por defecto
    };

    // Recupera un documento existente o crea uno nuevo si no existe
    const documentRef = collectionRef.doc(qrData);
    const documentSnapshot = await documentRef.get();

    if (documentSnapshot.exists) {
      const existingData = documentSnapshot.data();

      // Verifica si cada campo nuevo ya existe en el documento
      const updatedFields = {};
      for (const [key, value] of Object.entries(newFields)) {
        if (!(key in existingData)) {
          updatedFields[key] = value;
        }
      }

      // Actualiza solo los campos nuevos que no existen
      if (Object.keys(updatedFields).length > 0) {
        await documentRef.update(updatedFields);
      }
    } else {
      // Si el documento no existe, crea uno nuevo con todos los campos
      await documentRef.set({
        ...newFields,
        profileName: '',
        profileLastName: '',
        profileEmail: '',
        profile: '',
        profilePhoneNumber: '',
        profilePicture: '',
        profileIsAdmin: false,
      });
    }

    console.log(`Generated QR Code ${i}`);
  }

  // Actualiza el valor de "lastProfileId" en el documento "metadata" al final de la generación
  await metadataRef.set({ lastProfileId });
}

generateAndSaveQRCodes()
  .then(() => {
    console.log('QR Codes generated and saved successfully.');
    process.exit();
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
