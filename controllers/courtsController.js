const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
app.use(bodyParser.json());

const createCourt = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;
    // Genera el número secuencial utilizando la función
    const classSerialNumber = await generateSequentialNumber(gymId);

    // Genera el nombre del documento
    const documentName = `court-${gymId}-${classSerialNumber}`;
    // Crea el nuevo documento en la colección "memberships" en Firebase
    const profilesCollection = db.collection('courts');
    const newProfileRef = profilesCollection.doc(documentName);
    await newProfileRef.set(body);

    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      courtLastSerialNumber: documentName,
    });

    res.status(201).json({
      message: 'Membership created',
      documentName,
      body,
    });
  } catch (error) {
    console.error('Error creating membership:', error);
    res.status(500).json({
      message: 'An error occurred while creating the membership',
    });
  }
};

async function generateSequentialNumber(gymId) {
  try {
    const metadataRef = db.collection('gyms').doc(gymId);
    const metadataDoc = await metadataRef.get();

    // Obtén el valor actual de gymCourts o inicialízalo en 0 si no existe
    let gymCourts = metadataDoc.exists ? metadataDoc.data().gymCourts : 0;

    // Incrementa el valor de gymCourts
    gymCourts++;

    // Actualiza el número de secuencia en "metadata"
    await metadataRef.set({ gymCourts }, { merge: true });

    // Devuelve el número secuencial formateado
    return gymCourts;
  } catch (error) {
    console.error('Error generating sequential number:', error);
    throw error; // Puedes manejar el error según tus necesidades
  }
}

const getAllCourts = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getClassesCollection = db.collection('courts');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getClassesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const classesArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const membership = {
        id: doc.id,
        courtId: data.courtId,
        courtName: data.courtName, // Si descriptions no está definido, usar un array vacío
        bookingPermissionsChecked: data.bookingPermissionsChecked, // Si gymId no está definido, usar una cadena vacía
        maxBookingPerBlock: data?.maxBookingPerBlock,
        maxBookingPerDay: data?.maxBookingPerDay,
        maxBookingPerWeek: data?.maxBookingPerWeek,
        courtStatus: data.courtStatus,
        bookingFee: data.bookingFee, // Si planName no está definido, usar una cadena vacía
        unlimitedPerBlock: data.unlimitedPerBlock,
        unlimitedPerDay: data.unlimitedPerDay,
        unlimitedPerWeek: data.unlimitedPerWeek,
      };
      classesArray.push(membership);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(classesArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};
const updateCourt = async (req, res) => {
  try {
    const { courtId, formData } = req.body;
    console.log(courtId, formData);
    const profileRef = db.collection('courts').doc(courtId);

    // Actualiza el documento con los datos proporcionados en formData
    await profileRef.update(formData);

    res.json({ message: 'Profile record updated successfully' });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

const deleteCourt = async (req, res) => {
  try {
    const courtsId = req.params.id;
    console.log(courtsId, req.params.id);
    const db = admin.firestore();
    const classRef = db.collection('courts').doc(courtsId);

    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    const classData = classDoc.data();
    const gymId = classData.gymId;

    // Elimina la membresía de la colección "memberships"
    await classRef.delete();

    if (gymId) {
      // Si la membresía está asociada a un gimnasio, también elimínala de la colección "memberships" del gimnasio

      // Actualiza el número secuencial en "metadata" del gimnasio si corresponde
      const metadataRef = db.collection('gyms').doc(gymId);
      const metadataDoc = await metadataRef.get();

      if (metadataDoc.exists) {
        const data = metadataDoc.data();
        const gymCourts = data.gymCourts - 1;

        await metadataRef.update({ gymCourts });
      }
    }

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  createCourt,
  getAllCourts,
  updateCourt,
  deleteCourt,
};
