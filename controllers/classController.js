const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
app.use(bodyParser.json());

const createClass = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;
    // Genera el número secuencial utilizando la función
    const classSerialNumber = await generateSequentialNumber(gymId);

    // Genera el nombre del documento
    const documentName = `class-${gymId}-${classSerialNumber}`;
    body.classId = documentName;

    // Crea el nuevo documento en la colección "memberships" en Firebase
    const profilesCollection = db.collection('classes');
    const newProfileRef = profilesCollection.doc(documentName);
    await newProfileRef.set(body);

    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      classLastSerialNumber: documentName,
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
  // Consulta la colección "metadata" para obtener el último número secuencial
  const metadataRef = db.collection('gyms').doc(gymId);
  const metadataDoc = await metadataRef.get();
  let gymClasses = 1;

  if (metadataDoc.exists) {
    const data = metadataDoc.data();
    gymClasses = data.gymClasses + 1;
  }

  // Actualiza el número de secuencia en "metadata"
  await metadataRef.set({ gymClasses }, { merge: true });

  // Devuelve el número secuencial formateado
  return gymClasses;
}
const getAllClasses = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getClassesCollection = db.collection('classes');

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
        classId: data.classId,
        descriptions: data.descriptions, // Si descriptions no está definido, usar un array vacío
        gymId: data.gymId, // Si gymId no está definido, usar una cadena vacía
        activityType: data.activityType,
        classCapacity: data.classCapacity,
        className: data.className,
        selectedWeekDays: data.selectedWeekDays,
        selectTrainer: data.selectTrainer, // Si planName no está definido, usar una cadena vacía
        startTime: data.startTime,
        endTime: data.endTime,
        eventDate: data.eventDate,
        eventColor: data.eventColor,
        limitCapacity: data.limitCapacity,
        repeatDaily: data.repeatDaily,
        weekDays: data.weekDays,
        expirationDate: data.expirationDate,
        participants: data?.participants,
        currentClassParticipants: data?.currentClassParticipants,
        classesCancelled: data?.classesCancelled,
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

const deleteClass = async (req, res) => {
  try {
    const classId = req.params.classId;
    const db = admin.firestore();
    const classRef = db.collection('classes').doc(classId);

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
        const gymClasses = data.gymClasses - 1;

        await metadataRef.update({ gymClasses });
      }
    }

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateClass = async (req, res) => {
  try {
    const { classId, formData } = req.body;

    const profileRef = db.collection('classes').doc(classId);

    // Actualiza el documento con los datos proporcionados en formData
    await profileRef.update(formData);

    res.json({ message: 'Profile record updated successfully' });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

const getTrainers = async (req, res) => {
  try {
    const gymId = req.params.gymId;

    // Realiza la consulta a la colección de perfiles en Firestore
    const snapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', '==', 'trainer')
      .get();

    const trainers = snapshot.docs.map((doc) => doc.data());

    res.json(trainers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const addParticipants = async (req, res) => {
  try {
    const participants = req.body.memberForm; // Extraer la lista de participantes de req.body.memberForm
    const classId = req.body.classId;

    // Obtén la referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén la referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();

    // Si la clase no existe, crea un nuevo documento con el campo participants inicializado en 1
    if (!classDoc.exists) {
      await classDocRef.set({
        participants: participants,
        currentClassParticipants: 1,
      });

      return res.status(200).json({
        message: 'Participantes agregados con éxito',
        currentClassParticipants: 1,
      });
    }

    // Obtiene el campo de participantes actual
    const currentParticipants = classDoc.data().participants || [];

    // Actualiza el campo de participantes utilizando arrayUnion
    await classDocRef.update({
      participants: admin.firestore.FieldValue.arrayUnion(...participants),
      currentClassParticipants: currentParticipants.length + 1,
    });

    return res.status(200).json({
      message: 'Participantes agregados con éxito',
      currentClassParticipants: currentParticipants.length + 1,
    });
  } catch (error) {
    console.error('Error al agregar participantes:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const removeParticipant = async (req, res) => {
  try {
    const { deletedProfileId, classId } = req.body;

    // Obtén una referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // Obtén los participantes actuales de la clase
    const currentParticipants = classDoc.data().participants || [];

    // Filtra los participantes para excluir al participante con deletedProfileId
    const updatedParticipants = currentParticipants.filter(
      (participant) => participant.profileId !== deletedProfileId
    );

    // Actualiza el campo de participantes en el documento de la clase
    await classDocRef.update({
      participants: updatedParticipants,
      currentClassParticipants: updatedParticipants.length,
    });

    // Obtiene la clase actualizada para contar el número de participantes
    const updatedClassDoc = await classDocRef.get();
    const currentClassParticipants = updatedClassDoc.data().participants.length;

    // Devuelve una respuesta exitosa junto con el nuevo número de participantes
    res.status(200).json({
      message: 'Participante eliminado con éxito',
      currentClassParticipants: currentClassParticipants,
    });
  } catch (error) {
    console.error('Error al eliminar participante:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const cancelClass = async (req, res) => {
  try {
    const { classId, eventStartDate } = req.body;

    // Obtén una referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // Obtén el array classesCancelled del documento actual o inicializa en caso de que no exista
    const classesCancelled = classDoc.data().classesCancelled || [];

    // Agrega el eventStartDate al array classesCancelled
    classesCancelled.push(eventStartDate);

    // Actualiza el campo classesCancelled en el documento de la clase
    await classDocRef.update({ classesCancelled: classesCancelled });

    return res.status(200).json({ message: 'Clase cancelada con éxito' });
  } catch (error) {
    console.error('Error al cancelar la clase:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

module.exports = {
  createClass,
  getAllClasses,
  deleteClass,
  updateClass,
  getTrainers,
  addParticipants,
  removeParticipant,
  cancelClass,
};
