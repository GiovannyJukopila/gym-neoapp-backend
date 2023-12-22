const express = require('express');
const app = express();
const { db } = require('../firebase');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');

const getGym = async (req, res) => {
  try {
    const getgym = db.collection('gyms').doc(req.params.id);
    const response = await getgym.get();
    res.send(response.data());
  } catch (error) {
    res.status(500).send(error);
  }
};

const updateAdminSettings = async (req, res) => {
  try {
    const gymId = req.params.gymId;
    const modifiedAuthorizations = req.body;
    const gymRef = db.collection('gyms').doc(gymId);

    // Obtiene las autorizaciones actuales del gimnasio desde Firestore
    const gymDoc = await gymRef.get();
    const gymData = gymDoc.data();
    const existingAuthorizations = gymData.AdminAuthorization;

    // Combina las autorizaciones modificadas con las existentes en el gimnasio
    const updatedAuthorizations = {
      ...existingAuthorizations,
      ...modifiedAuthorizations,
    };

    // Actualiza las autorizaciones en Firestore
    await gymRef.update({ AdminAuthorization: updatedAuthorizations });

    res.status(200).json({
      success: true,
      message: 'Configuraciones actualizadas con éxito',
    });
  } catch (error) {
    console.error('Error al actualizar configuraciones:', error);
    res
      .status(500)
      .json({ success: false, message: 'Error al actualizar configuraciones' });
  }
};

const updateGymInfo = async (req, res) => {
  try {
    const gymId = req.params.gymId;
    const gymData = req.body;

    const gymRef = db.collection('gyms').doc(gymId);

    // Obtén los datos actuales del gimnasio
    const doc = await gymRef.get();

    if (!doc.exists) {
      throw new Error('El gimnasio no existe');
    }

    // Combinar los datos actuales con los datos actualizados
    const newData = {
      ...doc.data(),
      ...gymData, // Cambia updatedData a gymData
    };

    // Actualiza los campos del gimnasio en Firestore
    await gymRef.update(newData);

    res.status(200).json({
      success: true,
      message: 'Configuraciones actualizadas con éxito',
    });
  } catch (error) {
    console.error('Error al actualizar configuraciones:', error);
    res
      .status(500)
      .json({ success: false, message: 'Error al actualizar configuraciones' });
  }
};

const uploadFileToStorage = async (
  fileBuffer,
  fileName,
  contentType,
  gymId
) => {
  const bucket = admin.storage().bucket(); // Obtén el bucket de almacenamiento

  const folderName = `Gyms/${gymId}/`; // Carpeta personalizada para cada gimnasio
  const file = bucket.file(`${folderName}${fileName}`);

  // Upload the file to Cloud Storage
  await file.save(fileBuffer, {
    metadata: {
      contentType: contentType, // Establece el tipo de contenido adecuado
    },
  });

  return file; // Retornamos el objeto File para obtener la URL de descarga más adelante
};

const uploadGymLogo = async (req, res) => {
  try {
    const { gymId, gymLogoName } = req.body;
    const file = req.file; // Aquí asumimos que el archivo se encuentra en el campo 'file' de la solicitud
    // Verifica si se adjuntó un archivo en la solicitud
    if (!file) {
      return res
        .status(400)
        .json({ error: 'No se ha proporcionado un archivo.' });
    }

    // Determina el tipo de contenido del archivo
    let contentType;

    if (file.mimetype === 'image/png') {
      contentType = 'image/png';
    } else if (file.mimetype === 'image/jpeg') {
      contentType = 'image/jpeg';
    } else if (file.mimetype === 'application/pdf') {
      contentType = 'application/pdf';
    } else {
      // Puedes manejar otros tipos de contenido aquí si es necesario
      return res.status(400).json({ error: 'Tipo de archivo no admitido.' });
    }

    // Luego, guarda el archivo en el almacenamiento en la nube y obtenemos el objeto File
    const uploadedFile = await uploadFileToStorage(
      file.buffer,
      file.originalname,
      contentType,
      gymId // Pasamos el ID del gimnasio para crear la carpeta personalizada
    );

    // Obtén la URL de descarga del archivo
    const fileUrl = await uploadedFile.getSignedUrl({
      action: 'read',
      expires: '01-01-3000', // Define la fecha de caducidad de la URL
    });

    const gymRef = admin.firestore().collection('gyms').doc(gymId);

    await gymRef.set(
      {
        gymLogo: fileUrl,
        gymLogoName: gymLogoName,
        gymLogoWasUpload: true,
      },
      { merge: true }
    );

    // Resto de tu lógica aquí...
  } catch (error) {
    console.error('Error al cargar el archivo:', error);
    res
      .status(500)
      .json({ error: 'Error al cargar el archivo', message: error.message });
  }
};

const deleteGymLogo = async (req, res) => {
  try {
    const { gymId, gymLogoName } = req.query;
    //const { gymId } = req.params; // Obtiene el ID del gimnasio de los parámetros de la URL
    // Verifica si se proporcionó un ID de gimnasio válido
    if (!gymId) {
      return res
        .status(400)
        .json({ error: 'Se requiere un ID de gimnasio válido.' });
    }

    const bucket = admin.storage().bucket();
    const folderName = `Gyms/${gymId}/`;
    const file = bucket.file(`${folderName}${gymLogoName}`); // Cambia "gymLogo.jpg" al nombre real del logo

    // Verifica si el archivo del logo existe antes de intentar eliminarlo
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'El logo no existe.' });
    }

    // Elimina el archivo del logo
    await file.delete();

    // Actualiza la información del logo del gimnasio en Firestore
    const gymRef = admin.firestore().collection('gyms').doc(gymId);
    const updateObj = {
      gymLogo: admin.firestore.FieldValue.delete(), // Elimina la URL del logo
      gymLogoName: '', // Puedes borrar el nombre del logo si lo deseas
      gymLogoWasUpload: false, // Actualiza el estado de carga del logo
    };
    await gymRef.update(updateObj);

    return res
      .status(200)
      .json({ message: 'Logo del gimnasio eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar el logo del gimnasio:', error);
    return res.status(500).json({
      error: 'Error al eliminar el logo del gimnasio',
      message: error.message,
    });
  }
};

module.exports = {
  getGym,
  updateAdminSettings,
  updateGymInfo,
  uploadGymLogo,
  deleteGymLogo,
};
