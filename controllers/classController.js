const express = require('express');
const app = express();
const { db } = require('../firebase');
const { logMovement } = require('../utils/logMovement');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const moment = require('moment');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit-table');
const { format, parseISO } = require('date-fns');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
require('dotenv').config();

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

app.use(bodyParser.json());

const createClass = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;
    const profileId = body.profileId; // Asegúrate de que `profileId` esté en el body

    const eventDate = new Date(body.eventDate);
    const classes = [];

    if (body.expirationDate !== null) {
      const expirationDate = new Date(body.expirationDate);
      const gymClassSerialNumber = await generateSequentialNumber(gymId);
      const personalClassId = `personal-class-${gymId}-${gymClassSerialNumber}-${
        eventDate.toISOString().split('T')[0]
      }-${expirationDate.toISOString().split('T')[0]}`;

      // Iterar sobre cada día entre eventDate y expirationDate
      const currentDate = new Date(eventDate);
      while (currentDate <= expirationDate) {
        const dayOfWeek = currentDate.getDay();
        if (body.selectedWeekDays.includes(dayOfWeek)) {
          const classSerialNumber = await generateSequentialNumber(gymId);
          const classId = `class-${gymId}-${classSerialNumber}`;

          const classObj = {
            classId: classId,
            gymId: gymId,
            personalClassId: personalClassId,
            eventDate: currentDate.toISOString(),
            className: body.className,
            startTime: body.startTime,
            endTime: body.endTime,
            repeatDaily: body.repeatDaily,
            eventColor: body.eventColor,
            weekDays: Array.from({ length: 7 }, (_, i) => i === dayOfWeek),
            expirationDate: body.expirationDate,
            selectTrainer: body.selectTrainer,
            limitCapacity: body.limitCapacity,
            classCapacity: body.classCapacity,
            description: body.description,
            selectedWeekDays: [dayOfWeek],
            unknownClassCapacity: body?.unknownClassCapacity,
            primaryClassId: body?.primaryClassSelected,
          };

          classes.push(classObj);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const expirationDayOfWeek = expirationDate.getDay();
      if (body.selectedWeekDays.includes(expirationDayOfWeek)) {
        const expirationClassSerialNumber = await generateSequentialNumber(
          gymId
        );
        const expirationClassId = `class-${gymId}-${expirationClassSerialNumber}`;

        const expirationClassObj = {
          classId: expirationClassId,
          gymId: gymId,
          personalClassId: personalClassId,
          eventDate: expirationDate.toISOString(),
          className: body.className,
          startTime: body.startTime,
          endTime: body.endTime,
          repeatDaily: body.repeatDaily,
          eventColor: body.eventColor,
          weekDays: Array.from(
            { length: 7 },
            (_, i) => i === expirationDayOfWeek
          ),
          expirationDate: body.expirationDate,
          selectTrainer: body.selectTrainer,
          limitCapacity: body.limitCapacity,
          classCapacity: body.classCapacity,
          description: body.description,
          selectedWeekDays: [expirationDayOfWeek],
          unknownClassCapacity: body?.unknownClassCapacity,
          primaryClassId: body?.primaryClassSelected,
        };
        classes.push(expirationClassObj);
      }

      const profilesCollection = db.collection('classes');
      const batch = db.batch();
      classes.forEach((classObj) => {
        const classRef = profilesCollection.doc(classObj.classId);
        batch.set(classRef, classObj);
      });
      await batch.commit();

      await logMovement(
        profileId,
        gymId,
        'class',
        'create',
        classes.map((cls) => cls.classId)
      );

      res.status(201).json({
        message: 'Classes created successfully',
        classes: classes,
      });
    } else if (body.selectedWeekDays && body.selectedWeekDays.length > 0) {
      const gymClassSerialNumber = await generateSequentialNumber(gymId);
      const personalClassId = `personal-class-${gymId}-${gymClassSerialNumber}-${
        eventDate.toISOString().split('T')[0]
      }`;

      for (const dayOfWeek of body.selectedWeekDays) {
        const classSerialNumber = await generateSequentialNumber(gymId);
        const classId = `class-${gymId}-${classSerialNumber}`;

        const classObj = {
          classId: classId,
          gymId: gymId,
          personalClassId: personalClassId,
          eventDate: eventDate.toISOString(),
          className: body.className,
          startTime: body.startTime,
          endTime: body.endTime,
          repeatDaily: body.repeatDaily,
          eventColor: body.eventColor,
          weekDays: Array.from({ length: 7 }, (_, i) => i === dayOfWeek),
          selectTrainer: body.selectTrainer,
          limitCapacity: body.limitCapacity,
          classCapacity: body.classCapacity,
          description: body.description,
          selectedWeekDays: [dayOfWeek],
          unknownClassCapacity: body?.unknownClassCapacity,
          primaryClassId: body?.primaryClassSelected,
        };

        classes.push(classObj);
      }

      const profilesCollection = db.collection('classes');
      const batch = db.batch();
      classes.forEach((classObj) => {
        const classRef = profilesCollection.doc(classObj.classId);
        batch.set(classRef, classObj);
      });
      await batch.commit();

      await logMovement(
        profileId,
        gymId,
        'class',
        'create',
        classes.map((cls) => cls.classId)
      );

      res.status(201).json({
        message: 'Classes created successfully',
        classes: classes,
      });
    } else {
      const classSerialNumber = await generateSequentialNumber(gymId);
      const documentName = `class-${gymId}-${classSerialNumber}`;
      body.classId = documentName;

      const profilesCollection = db.collection('classes');
      const newClassRef = profilesCollection.doc(documentName);
      await newClassRef.set(body);

      const gymsCollection = db.collection('gyms');
      await gymsCollection.doc(gymId).update({
        classLastSerialNumber: documentName,
      });

      await logMovement(profileId, gymId, 'class', 'create', [documentName]);

      res.status(201).json({
        message: 'Class created successfully',
        documentName,
        class: body,
      });
    }
  } catch (error) {
    console.error('Error creating classes:', error);
    res.status(500).json({
      message: 'An error occurred while creating the classes',
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
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const getClassesCollection = db.collection('classes');

    const response = await getClassesCollection
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', startDate)
      .where('eventDate', '<=', endDate)
      .get();

    const classesArray = [];
    for (const doc of response.docs) {
      const data = doc.data();
      const classId = doc.id;

      // Obtener los participantes regulares
      const participantsSnapshot = await doc.ref
        .collection('participants')
        .select(
          'profileId',
          'profileName',
          'profileLastname',
          'attendance',
          'profilePicture',
          'profileEmail'
        ) // Especifica los campos que deseas
        .get();
      const participants = participantsSnapshot.docs.map((participantDoc) =>
        participantDoc.data()
      );

      // Obtener los participantes desconocidos
      const unknownParticipantsSnapshot = await doc.ref
        .collection('unknownParticipants')
        .get();
      const unknownParticipants = unknownParticipantsSnapshot.docs.map(
        (unknownParticipantDoc) => unknownParticipantDoc.data()
      );

      // Obtener la lista de espera de miembros conocidos
      const waitingListSnapshot = await doc.ref
        .collection('waitingList')
        .orderBy('position') // Ordenar por posición
        .get();
      const waitingList = waitingListSnapshot.docs.map((waitingDoc) =>
        waitingDoc.data()
      );

      // Obtener la lista de espera de miembros desconocidos
      const unknownWaitingListSnapshot = await doc.ref
        .collection('unknownWaitingList')
        .orderBy('position') // Ordenar por posición
        .get();
      const unknownWaitingList = unknownWaitingListSnapshot.docs.map(
        (unknownWaitingDoc) => unknownWaitingDoc.data()
      );

      // Crear el objeto de clase con toda la información necesaria
      const membership = {
        id: classId,
        classId: data.classId,
        description: data.description || [],
        gymId: data.gymId || '',
        activityType: data.activityType,
        classCapacity: data.classCapacity,
        className: data.className,
        selectedWeekDays: data.selectedWeekDays,
        selectTrainer: data.selectTrainer || '',
        startTime: data.startTime,
        endTime: data.endTime,
        eventDate: data.eventDate,
        eventColor: data.eventColor,
        limitCapacity: data.limitCapacity,
        repeatDaily: data.repeatDaily,
        weekDays: data.weekDays,
        expirationDate: data.expirationDate,
        participants: participants,
        currentClassParticipants: data.currentClassParticipants,
        unknownParticipants: unknownParticipants,
        currentUnknownClassParticipants: data.currentUnknownClassParticipants,
        waitingList: waitingList, // Lista de espera de miembros conocidos
        unknownWaitingList: unknownWaitingList, // Lista de espera de miembros desconocidos
        attendance: data.attendance,
        classesCancelled: data.classesCancelled,
        personalClassId: data.personalClassId,
        unknownClassCapacity: data.unknownClassCapacity,
        primaryClassId: data?.primaryClassId,
      };

      // Agregar la clase procesada al array
      classesArray.push(membership);
    }

    // Enviar la respuesta con la lista de clases y sus detalles
    res.status(200).json(classesArray);
  } catch (error) {
    console.error('Error en getAllClasses:', error);
    res.status(500).send(error);
  }
};

const deleteAllClasses = async (req, res) => {
  try {
    const gymId = req.body.gymId; // Obtiene el gymId del cuerpo de la solicitud
    const profileId = req.body.profileId; // Obtiene el profileId del cuerpo de la solicitud
    const personalClassId = req.params.personalClassId; // Obtiene el personalClassId de los parámetros de la URL

    if (!gymId || !profileId) {
      return res
        .status(400)
        .json({ message: 'gymId and profileId are required' });
    }

    // Obtener todas las clases asociadas con el personalClassId
    const classesSnapshot = await db
      .collection('classes')
      .where('gymId', '==', gymId)
      .where('personalClassId', '==', personalClassId)
      .get();

    const failedClasses = []; // Almacenar las clases que no se pueden eliminar
    const deletedClassIds = []; // Almacenar los classId de las clases que se eliminan correctamente

    const batch = db.batch();

    for (const classDoc of classesSnapshot.docs) {
      const participantsSnapshot = await classDoc.ref
        .collection('participants')
        .get();

      if (!participantsSnapshot.empty) {
        // La clase tiene participantes, por lo que no se puede eliminar
        failedClasses.push({
          classId: classDoc.id, // Agregar el classId de la clase que no se puede eliminar
          eventDate: classDoc.data().eventDate, // Guardar la fecha de la clase que no se puede eliminar
        });
      } else {
        // La clase no tiene participantes, se puede eliminar
        batch.delete(classDoc.ref);
        deletedClassIds.push(classDoc.id); // Agregar el classId de la clase eliminada
      }
    }

    await batch.commit();

    // Registrar el movimiento
    await logMovement(
      profileId,
      gymId,
      'classes',
      'deleteAll',
      deletedClassIds
    );

    if (failedClasses.length > 0) {
      // Devolver las clases que no se pudieron eliminar debido a que tienen participantes
      res.status(400).json({
        message: `Some classes associated with personalClassId ${personalClassId} have participants and cannot be deleted`,
        failedClasses: failedClasses,
        deletedClassIds: deletedClassIds, // Devolver también las clases eliminadas correctamente
      });
    } else {
      res.status(200).json({
        message: `Classes associated with personalClassId ${personalClassId} deleted successfully`,
        deletedClassIds: deletedClassIds, // Devolver las clases eliminadas correctamente
      });
    }
  } catch (error) {
    console.error('Error deleting classes:', error);
    res.status(500).json({
      message: 'An error occurred while deleting the classes',
    });
  }
};

// const deleteAllClasses = async (req, res) => {
//   try {
//     const gymId = req.body.gymId; // Obtiene el gymId del cuerpo de la solicitud
//     const personalClassId = req.params.personalClassId; // Obtiene el personalClassId de los parámetros de la URL

//     // Obtener todas las clases asociadas con el personalClassId
//     const classesSnapshot = await db
//       .collection('classes')
//       .where('gymId', '==', gymId)
//       .where('personalClassId', '==', personalClassId)
//       .get();

//     const failedClasses = []; // Almacenar las clases que no se pueden eliminar

//     const batch = db.batch();
//     classesSnapshot.forEach((classDoc) => {
//       const classData = classDoc.data();
//       // Verificar si la clase tiene participantes
//       if (classData.participants && classData.participants.length > 0) {
//         // La clase tiene participantes, por lo que no se puede eliminar
//         failedClasses.push({
//           eventDate: classData.eventDate, // Guardar la fecha de la clase que no se puede eliminar
//         });
//       } else {
//         // La clase no tiene participantes, se puede eliminar
//         batch.delete(classDoc.ref);
//       }
//     });

//     await batch.commit();

//     if (failedClasses.length > 0) {
//       // Devolver las clases que no se pudieron eliminar debido a que tienen participantes
//       res.status(400).json({
//         message: `Some classes associated with personalClassId ${personalClassId} have participants and cannot be deleted`,
//         failedClasses: failedClasses,
//       });
//     } else {
//       res.status(200).json({
//         message: `Classes associated with personalClassId ${personalClassId} deleted successfully`,
//       });
//     }
//   } catch (error) {
//     console.error('Error deleting classes:', error);
//     res.status(500).json({
//       message: 'An error occurred while deleting the classes',
//     });
//   }
// };

const deleteClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const { gymId, profileId } = req.body;

    if (!gymId || !profileId) {
      return res
        .status(400)
        .json({ message: 'gymId and profileId are required' });
    }

    const db = admin.firestore();
    const classRef = db.collection('classes').doc(classId);

    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const classData = classDoc.data();

    await classRef.delete();

    await logMovement(profileId, gymId, 'classes', 'delete', [classId]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const deletePrimaryClass = async (req, res) => {
  try {
    const classId = req.params.classId;
    const { gymId, profileId } = req.body;
    const db = admin.firestore();
    const classRef = db.collection('primaryClasses').doc(classId);

    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ error: 'Clase no encontrada' });
    }

    // Elimina la clase de la colección "primaryClasses"
    await classRef.delete();

    if (gymId) {
      // Si la clase está asociada a un gimnasio, actualiza el número de clases primarias en el documento del gimnasio
      const metadataRef = db.collection('gyms').doc(gymId);
      const metadataDoc = await metadataRef.get();

      if (metadataDoc.exists) {
        const data = metadataDoc.data();
        const gymPrimaryClasses = data.gymPrimaryClasses - 1;

        await metadataRef.update({ gymPrimaryClasses });
      }
    }

    // Registrar el movimiento
    await logMovement(
      profileId, // ID del perfil que realiza la acción
      gymId, // ID del gimnasio
      'primaryClass', // Sección afectada
      'delete', // Acción realizada
      [classId], // Clases afectadas (en este caso, una sola clase)
      [] // Perfiles afectados (vacío porque no se afectan perfiles directamente)
    );

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error al eliminar la clase primaria:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

const updateClass = async (req, res) => {
  try {
    const { classId, formData, gymId, profileId } = req.body;

    // Verificar que gymId y profileId están presentes
    if (!gymId || !profileId) {
      return res
        .status(400)
        .json({ message: 'gymId and profileId are required' });
    }

    const classRef = db.collection('classes').doc(classId);

    // Actualizar el documento con los datos proporcionados en formData
    await classRef.update(formData);

    // Obtener el documento actualizado
    const updatedClass = await classRef.get();

    // Registrar el movimiento de actualización
    await logMovement(profileId, gymId, 'classes', 'update', [classId]);

    // Devolver la clase actualizada como respuesta
    res.json({
      message: 'Class record updated successfully',
      class: updatedClass.data(), // Enviar los datos de la clase actualizada
    });
  } catch (error) {
    console.error('Error updating class:', error.message);
    res.status(400).send(error.message);
  }
};

const updateAllClasses = async (req, res) => {
  try {
    const { personalClassId, formData, gymId, profileId } = req.body;
    const currentDate = new Date().toISOString(); // Obtener la fecha actual en formato ISO

    // Verificar que gymId y profileId están presentes
    if (!gymId || !profileId) {
      return res
        .status(400)
        .json({ message: 'gymId and profileId are required' });
    }

    // Crear una copia de formData excluyendo eventDate, weekDays y selectedWeekDays
    const { eventDate, weekDays, selectedWeekDays, ...filteredFormData } =
      formData;

    // Buscar la clase con el personalClassId y una fecha futura o actual
    const classSnapshot = await db
      .collection('classes')
      .where('personalClassId', '==', personalClassId)
      .where('eventDate', '>=', currentDate)
      .get();

    if (classSnapshot.empty) {
      return res.status(404).json({
        message: 'No classes to update from the current day onward',
      });
    }

    // Almacenar las clases antes de actualizarlas
    const updatedClassesBefore = [];
    const updatedClassesAfter = [];

    // Actualizar todas las clases encontradas
    const batch = db.batch();

    classSnapshot.forEach((classDoc) => {
      const classRef = classDoc.ref;
      updatedClassesBefore.push({ id: classDoc.id, ...classDoc.data() }); // Almacena los datos antes de la actualización
      batch.update(classRef, filteredFormData);
    });

    await batch.commit();

    const updatedClassSnapshot = await db
      .collection('classes')
      .where('personalClassId', '==', personalClassId)
      .where('eventDate', '>=', currentDate)
      .get();

    updatedClassSnapshot.forEach((classDoc) => {
      updatedClassesAfter.push({ id: classDoc.id, ...classDoc.data() });
    });

    const updatedClassIds = updatedClassesAfter.map((c) => c.id);
    await logMovement(
      profileId,
      gymId,
      'classes',
      'updateAllClasses',
      updatedClassIds
    );

    res.json({
      message: 'Class(es) updated successfully',
      classes: updatedClassesAfter,
    });
  } catch (error) {
    console.error('Error updating classes:', error.message);
    res.status(400).send(error.message);
  }
};

const updatePrimaryClasses = async (req, res) => {
  try {
    const { classId, formData, profileId } = req.body; // Asegúrate de obtener el profileId desde el cuerpo de la solicitud

    // Verificar si todos los campos necesarios están presentes
    if (!classId || !formData || !profileId) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = db.collection('primaryClasses').doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // Actualiza el documento con los datos proporcionados en formData
    await classDocRef.update(formData);

    // Registrar el movimiento
    await logMovement(
      profileId, // ID del perfil que realiza la acción
      classDoc.data().gymId, // ID del gimnasio (debe estar en los datos de la clase)
      'primaryClass', // Sección afectada
      'update', // Acción realizada
      [classId], // Clases afectadas (en este caso, una sola clase)
      [] // Perfiles afectados (vacío porque no se afectan perfiles directamente)
    );

    res.status(200).json({ message: 'Profile record updated successfully' });
  } catch (error) {
    console.error('Error updating primary class:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const getTrainers = async (req, res) => {
  try {
    const gymId = req.params.gymId;

    // Realiza la consulta a la colección de perfiles en Firestore
    const snapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'trainer')
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
    const participants = req.body.memberForm; // Extraer los participantes de req.body.memberForm
    const classId = req.body.classId;
    const gymId = req.body.gymId; // Extraer gymId del cuerpo de la solicitud
    const profileId = req.body.profileId; // Extraer profileId del cuerpo de la solicitud

    // Asegúrate de que participants no esté vacío
    if (!participants || participants.length === 0) {
      return res.status(400).json({ message: 'No participants provided' });
    }

    // Extraer todos los profileId de los participantes
    const affectedProfiles = participants.map(
      (participant) => participant.profileId
    );

    // Obtener la referencia a la colección de clases
    const classesCollection = db.collection('classes');
    const classDocRef = classesCollection.doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      await classDocRef.set({
        currentClassParticipants: 0,
      });
    }

    // Obtener la referencia a la subcolección de participantes
    const participantsCollection = classDocRef.collection('participants');

    // Generar QR y agregar cada participante
    for (const memberForm of participants) {
      const qrData = `${memberForm.profileId},${classId}`;
      const qrCode = await generateQRCode(qrData);
      const participant = {
        ...memberForm,
        attendance: false,
        qrCode: qrCode,
      };

      // Añadir el nuevo participante a la subcolección usando profileId como ID del documento
      await participantsCollection.doc(memberForm.profileId).set(participant);
    }

    // Actualizar el campo de participantes actual
    const currentParticipantsCount = (await participantsCollection.get()).size;
    await classDocRef.update({
      currentClassParticipants: currentParticipantsCount,
    });

    // Registrar el movimiento con las clases y perfiles afectados
    await logMovement(
      profileId,
      gymId,
      'classes',
      'addMember',
      [classId],
      affectedProfiles
    );

    return res.status(200).json({
      message: 'Participantes agregados con éxito',
      currentClassParticipants: currentParticipantsCount,
    });
  } catch (error) {
    console.error('Error al agregar participantes y generar QR:', error);
    return res.status(500).json({ message: 'Error interno del servidor' });
  }
};

// Función para generar el código QR y retornarlo como base64
const generateQRCode = async (qrData) => {
  try {
    const qrDataString = JSON.stringify(qrData);
    const qrCode = await QRCode.toDataURL(qrDataString);
    return qrCode;
  } catch (error) {
    console.error('Error al generar código QR:', error);
    throw error;
  }
};

const addUnknownParticipants = async (req, res) => {
  try {
    const participants = req.body.memberForm; // Extraer la lista de participantes de req.body.memberForm
    const profileId = req.body.profileId;
    const classId = req.body.classId;
    const gymId = req.body.gymId; // Extraer gymId del cuerpo de la solicitud

    // Filtrar los participantes agregados con el profileId proporcionado
    const participantAdded = participants.filter(
      (participant) => participant.profileId === profileId
    );

    if (participantAdded.length === 0) {
      return res.status(400).json({
        message:
          'No se encontraron participantes con el profileId proporcionado',
      });
    }

    const { deductedAtBooking, prepaymentType, currentCredit } =
      participantAdded[0].selectedPackage;

    if (currentCredit === 0) {
      return res.status(400).json({
        message: 'Este miembro no tiene crédito disponible',
      });
    }

    if (prepaymentType !== 1 && prepaymentType !== 3) {
      return res.status(400).json({
        message: 'El paquete de este miembro no permite crear clases',
      });
    }

    if (deductedAtBooking) {
      // Restar 1 crédito del currentCredit del miembro
      participantAdded[0].currentCredit--;

      // Actualizar el currentCredit en el perfil de la persona
      const profileRef = db.collection('profiles').doc(profileId);
      await profileRef.update({
        currentCredit: admin.firestore.FieldValue.increment(-1),
      });
    }

    // Obtén la referencia a la colección de clases
    const classesCollection = db.collection('classes');
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      await classDocRef.set({
        currentUnknownClassParticipants: 0,
      });
    }

    // Obtén una referencia a la subcolección de participantes desconocidos
    const unknownParticipantsCollection = classDocRef.collection(
      'unknownParticipants'
    );
    const batch = db.batch();

    // Lista para almacenar los perfiles afectados
    const affectedProfiles = [];

    participants.forEach((participant) => {
      const participantDocRef = unknownParticipantsCollection.doc(
        participant.profileId
      );
      batch.set(participantDocRef, participant);
      if (!affectedProfiles.includes(participant.profileId)) {
        affectedProfiles.push(participant.profileId);
      }
    });

    await batch.commit();

    // Obtener el número de participantes actuales
    const updatedParticipantsSnapshot =
      await unknownParticipantsCollection.get();
    const currentUnknownClassParticipants = updatedParticipantsSnapshot.size;

    await classDocRef.update({
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });

    // Registrar el movimiento
    await logMovement(
      profileId,
      gymId,
      'classes',
      'addNonMember',
      [classId], // Asegúrate de que classId esté incluido en affectedClasses
      affectedProfiles // Lista de perfiles afectados
    );

    return res.status(200).json({
      message: 'Participantes agregados con éxito',
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });
  } catch (error) {
    console.error('Error al agregar participantes:', error);
    return res
      .status(500)
      .json({ message: 'Error interno del servidor al agregar participantes' });
  }
};

const removeParticipant = async (req, res) => {
  try {
    const { deletedProfileId, classId, profileId, gymId } = req.body;

    // Verificar si todos los campos necesarios están presentes
    if (!deletedProfileId || !classId || !profileId || !gymId) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    // Obtén una referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // Obtén una referencia a la subcolección de participantes
    const participantsCollection = classDocRef.collection('participants');

    // Elimina el participante directamente usando profileId como ID del documento
    const participantDocRef = participantsCollection.doc(deletedProfileId);
    const participantDoc = await participantDocRef.get();

    if (!participantDoc.exists) {
      return res
        .status(404)
        .json({ message: 'Participante no encontrado en la clase' });
    }

    await participantDocRef.delete();

    // Obtén el número de participantes restantes
    const updatedParticipantsSnapshot = await participantsCollection.get();
    const currentClassParticipants = updatedParticipantsSnapshot.size;

    // Actualiza el campo currentClassParticipants en el documento de la clase
    await classDocRef.update({
      currentClassParticipants: currentClassParticipants,
    });

    // Registrar el movimiento
    await logMovement(
      profileId, // ID del perfil que está realizando la acción
      gymId, // ID del gimnasio
      'classes', // Sección afectada
      'removeMember', // Acción realizada
      [classId], // Clases afectadas
      [deletedProfileId] // Perfiles afectados
    );

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

const removeUnknownParticipant = async (req, res) => {
  try {
    const { deletedProfileId, classId, profileId, gymId } = req.body;

    // Verificar si todos los campos necesarios están presentes
    if (!deletedProfileId || !classId || !profileId || !gymId) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    // Obtén una referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Clase no encontrada' });
    }

    // Obtén la subcolección de participantes desconocidos
    const unknownParticipantsCollection = classDocRef.collection(
      'unknownParticipants'
    );

    // Elimina el documento del participante usando profileId como ID
    const participantDocRef =
      unknownParticipantsCollection.doc(deletedProfileId);
    const participantDoc = await participantDocRef.get();

    if (!participantDoc.exists) {
      return res.status(404).json({ message: 'Participante no encontrado' });
    }

    // Elimina el documento del participante
    await participantDocRef.delete();

    // Obtén la cantidad actualizada de participantes
    const updatedParticipantsSnapshot =
      await unknownParticipantsCollection.get();
    const currentUnknownClassParticipants = updatedParticipantsSnapshot.size;

    // Actualiza el número de participantes en el documento de la clase
    await classDocRef.update({
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });

    // Registrar el movimiento
    await logMovement(
      profileId, // ID del perfil que realiza la acción
      gymId, // ID del gimnasio
      'classes', // Sección afectada
      'removeNonMember', // Acción realizada
      [classId], // Clases afectadas
      [deletedProfileId] // Perfiles afectados
    );

    // Devuelve una respuesta exitosa junto con el nuevo número de participantes
    res.status(200).json({
      message: 'Participante eliminado con éxito',
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });
  } catch (error) {
    console.error('Error al eliminar participante:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const cancelClass = async (req, res) => {
  try {
    const { classId, eventStartDate, profileId, gymId } = req.body;

    // Verificar si todos los campos necesarios están presentes
    if (!classId || !eventStartDate || !profileId || !gymId) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

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

    // Registrar el movimiento
    await logMovement(profileId, gymId, 'classes', 'cancel', [classId], []);

    return res.status(200).json({ message: 'Clase cancelada con éxito' });
  } catch (error) {
    console.error('Error al cancelar la clase:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

const getTodaysClasses = async (req, res) => {
  try {
    const gymId = req.params.gymId;

    const today = new Date().toISOString().slice(0, 10);

    const querySnapshot = await db
      .collection('classes')
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', `${today}T00:00:00.000Z`)
      .where('eventDate', '<=', `${today}T23:59:59.999Z`)
      .get();

    const todaysClasses = [];
    querySnapshot.forEach((doc) => {
      todaysClasses.push(doc.data());
    });

    res.status(200).json(todaysClasses);
  } catch (error) {
    console.error('Error al obtener las clases del día de hoy:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener las clases del día de hoy' });
  }
};

const getWeekClasses = async (req, res) => {
  try {
    const gymId = req.params.gymId;
    const filterDate = req.query.initialDate;

    // Convertir filterDate a un objeto Date
    const initialDate = new Date(filterDate);

    // Asegurarse de que initialDate sea una fecha válida
    if (isNaN(initialDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Obtener la fecha y hora actual
    const now = new Date();

    // Calcular el inicio de la semana actual (lunes)
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // Calcular el final de la semana actual (domingo)
    const endOfCurrentWeek = new Date(startOfCurrentWeek);
    endOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + 6);
    endOfCurrentWeek.setHours(23, 59, 59, 999);

    // Determinar si la fecha proporcionada está en la semana actual
    let startOfRange;
    let endOfRange;

    if (initialDate >= startOfCurrentWeek && initialDate <= endOfCurrentWeek) {
      // Si está en la semana actual, usar la fecha y hora actual como inicio del rango
      startOfRange = new Date(now);
      startOfRange.setMilliseconds(0);
      // Usar el final de la semana actual
      endOfRange = endOfCurrentWeek;
    } else {
      // Si está en otra semana, usar el lunes de esa semana como inicio del rango
      startOfRange = new Date(initialDate);
      startOfRange.setDate(initialDate.getDate() - initialDate.getDay() + 1);
      startOfRange.setHours(0, 0, 0, 0);
      // Usar el domingo de esa semana como final del rango
      endOfRange = new Date(startOfRange);
      endOfRange.setDate(startOfRange.getDate() + 6);
      endOfRange.setHours(23, 59, 59, 999);
    }

    // Función para formatear fechas a YYYY-MM-DDTHH:mm:ss.sssZ
    const formatDateTime = (date) => {
      const year = date.getFullYear();
      const month = ('0' + (date.getMonth() + 1)).slice(-2);
      const day = ('0' + date.getDate()).slice(-2);
      const hours = ('0' + date.getHours()).slice(-2);
      const minutes = ('0' + date.getMinutes()).slice(-2);
      const seconds = ('0' + date.getSeconds()).slice(-2);
      const milliseconds = ('00' + date.getMilliseconds()).slice(-3);
      return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;
    };

    // Consultar las clases filtradas por gymId y eventDate
    const classesRef = admin.firestore().collection('classes');
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', formatDateTime(startOfRange))
      .where('eventDate', '<=', formatDateTime(endOfRange))
      .get();

    // Extraer los datos de los documentos encontrados
    const classesWithinRange = [];
    snapshot.forEach((doc) => {
      classesWithinRange.push(doc.data());
    });

    // Devolver las clases encontradas en la respuesta
    res.status(200).json(classesWithinRange);
  } catch (error) {
    console.error('Error getting week classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const formatEventDateTime = (eventDate, startDate, endDate) => {
  if (!eventDate || !startDate || !endDate) {
    return '';
  }

  try {
    const formattedEventDate = format(parseISO(eventDate), 'EEEE, MMMM d, y');
    const formattedStartTime = format(
      parseISO(`1970-01-01T${startDate}`),
      'h:mm a'
    );
    const formattedEndTime = format(
      parseISO(`1970-01-01T${endDate}`),
      'h:mm a'
    );

    return `${formattedEventDate} - From ${formattedStartTime} to ${formattedEndTime}`;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

const formatTimestamp = (timestamp) => {
  if (!timestamp || !timestamp.toDate) {
    return 'N/A'; // Manejo para casos donde el timestamp no sea válido
  }
  const dateObject = timestamp.toDate(); // Convertir el Timestamp a un objeto Date
  return dateObject.toLocaleString(); // Formatear la fecha como string legible
};

const generateClassReport = async (req, res) => {
  const { gymId } = req.params;
  const { classId } = req.body;

  try {
    // Busca el documento de la clase por classId en la colección de classes
    const classDoc = await db.collection('classes').doc(classId).get();

    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const classData = classDoc.data();
    const formattedEventDateTime = formatEventDateTime(
      classData.eventDate,
      classData.startTime,
      classData.endTime
    );

    // Obtén los participantes miembros desde la subcolección 'participants'
    const participantsSnapshot = await classDoc.ref
      .collection('participants')
      .get();
    const participants = participantsSnapshot.docs.map((doc) => doc.data());

    // Obtén los participantes desconocidos desde la subcolección 'unknownParticipants'
    const unknownParticipantsSnapshot = await classDoc.ref
      .collection('unknownParticipants')
      .get();
    const unknownParticipants = unknownParticipantsSnapshot.docs.map((doc) =>
      doc.data()
    );

    // Obtén los datos de los perfiles de los participantes
    const participantsPromises = participants.map((participant) =>
      db.collection('profiles').doc(participant.profileId).get()
    );
    const participantDocs = await Promise.all(participantsPromises);
    const participantProfiles = participantDocs.map((doc) => doc.data());

    // Obtén los datos de los perfiles de los no miembros
    const unknownParticipantsPromises = unknownParticipants.map((participant) =>
      db.collection('profiles').doc(participant.profileId).get()
    );
    const unknownParticipantDocs = await Promise.all(
      unknownParticipantsPromises
    );
    const unknownParticipantProfiles = unknownParticipantDocs.map((doc) =>
      doc.data()
    );

    // Obtén los profileIds de los no miembros que asistieron desde attendanceHistory
    const nonMemberAttendanceQuerySnapshot = await db
      .collection('attendanceHistory')
      .where('activityId', '==', classId)
      .where('role', '==', 'non-member')
      .get();

    const nonMemberAttendanceData = nonMemberAttendanceQuerySnapshot.docs.map(
      (doc) => ({
        profileId: doc.data().profileId,
        attendanceDate: doc.data().attendanceDate,
        currentCredit: doc.data().currentCredit,
        cardSerialNumber: doc.data().cardSerialNumber,
      })
    );

    const nonMemberAttendanceProfileIds =
      nonMemberAttendanceQuerySnapshot.docs.map((doc) => doc.data().profileId);

    // Filtra los participantes no miembros para obtener solo los que asistieron
    const nonMemberParticipants = unknownParticipants.filter((participant) =>
      nonMemberAttendanceProfileIds.includes(participant.profileId)
    );

    // Obtén los datos de los perfiles de los no miembros que asistieron
    const nonMemberProfilesPromises = nonMemberParticipants.map((participant) =>
      db.collection('profiles').doc(participant.profileId).get()
    );
    const nonMemberProfilesDocs = await Promise.all(nonMemberProfilesPromises);
    const nonMemberProfilesData = nonMemberProfilesDocs
      .map((doc) => (doc.exists ? doc.data() : null))
      .filter((profile) => profile !== null);

    // Obtén los profileIds de los miembros que asistieron desde attendanceHistory
    const memberAttendanceQuerySnapshot = await db
      .collection('attendanceHistory')
      .where('activityId', '==', classId)
      .where('role', '==', 'member')
      .get();

    const memberAttendanceData = memberAttendanceQuerySnapshot.docs.map(
      (doc) => ({
        profileId: doc.data().profileId,
        attendanceDate: doc.data().attendanceDate,
        cardSerialNumber: doc.data().cardSerialNumber,
      })
    );

    const memberAttendanceProfileIds = memberAttendanceQuerySnapshot.docs.map(
      (doc) => doc.data().profileId
    );

    // Filtra los participantes miembros para obtener solo los que asistieron
    const memberParticipants = participants.filter((participant) =>
      memberAttendanceProfileIds.includes(participant.profileId)
    );

    // Obtén los datos de los perfiles de los miembros que asistieron
    const memberProfilesPromises = memberParticipants.map((participant) =>
      db.collection('profiles').doc(participant.profileId).get()
    );
    const memberProfilesDocs = await Promise.all(memberProfilesPromises);
    const memberProfilesData = memberProfilesDocs
      .map((doc) => (doc.exists ? doc.data() : null))
      .filter((profile) => profile !== null);

    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="class_report.pdf"');
    doc.pipe(res);

    // Encabezado del documento
    doc.rect(0, 0, 612, 80).fill('#FFA500');
    doc
      .fontSize(25)
      .fill('white')
      .text(`CLASS REPORT - ${classData.className}`, 50, 30, {
        align: 'left',
        valign: 'center',
      });

    // Información de la clase
    doc.fontSize(18).text(`${formattedEventDateTime}`, { bold: true });

    doc.moveDown(); // Mover más abajo
    doc.fillColor('black');
    doc.fontSize(12); // Cambiar color a negro

    // Totales de participantes y asistentes
    const totalMembersParticipants = participants.length;
    const totalNonMembersParticipants = unknownParticipants.length;
    const totalMembersAttendance = memberParticipants.length;
    const totalNonMembersAttendance = nonMemberParticipants.length;

    const totalsTableHeaders = [
      'Type',
      'Total Participants',
      'Total Attendance',
    ];
    const totalsTableData = [
      ['Members', totalMembersParticipants, totalMembersAttendance],
      ['Non-Members', totalNonMembersParticipants, totalNonMembersAttendance],
    ];

    // Generar tabla de totales
    generateSimpleTable(
      'Total Participants and Attendance',
      totalsTableData,
      totalsTableHeaders,
      doc
    );

    // Datos de los participantes y asistentes
    const tablesByType = {
      'Members Participants': {
        headers: ['Name', 'Email', 'Card Serial Number', 'Telephone'],
        data: participantProfiles.map((profile) => [
          `${profile.profileName || 'N/A'} ${profile.profileLastname || 'N/A'}`,
          profile.profileEmail || 'N/A',
          profile.cardSerialNumber || 'N/A',
          profile.profileTelephoneNumber || 'N/A',
        ]),
      },
      'Non-Members Participants': {
        headers: ['Name', 'Email', 'Card Serial Number', 'Telephone'],
        data: unknownParticipantProfiles.map((profile) => [
          `${profile.profileName || 'N/A'}`,
          profile.unknownMemberEmail || 'N/A',
          profile.cardSerialNumber || 'N/A',
          profile.unknownMemberPhoneNumber || 'N/A',
        ]),
      },
      'Members Attendance': {
        headers: [
          'Name',
          'Email',
          'Attendance Status',
          'Attendance Date',
          'Card Serial Number',
        ],
        data: memberProfilesData.map((profile, index) => [
          `${profile.profileName || 'N/A'} ${profile.profileLastname || 'N/A'}`,
          profile.profileEmail || 'N/A',
          'Attended',
          memberAttendanceData[index].attendanceDate
            ? formatTimestamp(memberAttendanceData[index].attendanceDate)
            : 'N/A',
          `${memberAttendanceData[index].cardSerialNumber || 'N/A'}`,
        ]),
      },
      'Non-Members Attendance': {
        headers: [
          'Name',
          'Email',
          'Attendance Status',
          'Attendance Date',
          'Current Credit',
          'Card Serial Number',
        ],
        data: nonMemberProfilesData.map((profile, index) => [
          `${profile.profileName || 'N/A'}`,
          profile.unknownMemberEmail || 'N/A',
          'Attended',
          nonMemberAttendanceData[index].attendanceDate
            ? formatTimestamp(nonMemberAttendanceData[index].attendanceDate)
            : 'N/A',
          `${nonMemberAttendanceData[index].currentCredit || 'N/A'}`,
          `${nonMemberAttendanceData[index].cardSerialNumber || 'N/A'}`,
        ]),
      },
    };

    for (const tableType in tablesByType) {
      const { headers, data } = tablesByType[tableType];
      if (data.length > 0) {
        // Verificar si hay suficiente espacio en la página actual
        if (doc.y + 300 > doc.page.height) {
          doc.addPage(); // Agregar una nueva página si no hay suficiente espacio
        }
        generateTable(tableType, data, headers, doc);
      }
    }

    // Finalizar el documento
    doc.end();
  } catch (error) {
    console.error('Error generating class report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Función para generar tablas simples
function generateSimpleTable(title, tableData, tableHeaders, doc) {
  const table = {
    title: title,
    headers: tableHeaders.map((header) => ({
      label: header,
      property: header.toLowerCase(),
      width: 100,
      renderer: null,
    })),
    rows: tableData.map((data) => data.map((cell) => String(cell))),
  };

  // Generar la tabla en el documento PDF
  doc.moveDown(0.5);
  doc.table(table, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
    prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
      doc.font('Helvetica').fontSize(10);
    },
    borderHorizontalWidths: (i) => 0.8,
    borderVerticalWidths: (i) => 0.8,
    borderColor: (i) => (i === -1 ? 'black' : 'gray'),
    padding: 10,
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });
}

function generateTable(tableType, tableData, tableHeaders, doc) {
  // Configuración de márgenes y ancho de página
  const pageWidth = doc.page.width;
  const marginLeft = 50;
  const marginRight = 50;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // Calcular el ancho actual de todas las columnas
  const currentTotalWidth = tableHeaders.length * 80;

  // Calcular el ancho adicional para distribuir
  const extraWidth = contentWidth - currentTotalWidth;
  const extraWidthPerColumn = extraWidth / tableHeaders.length;

  // Configurar las columnas con el nuevo ancho
  const table = {
    title: `${tableType}`,
    headers: tableHeaders.map((header) => ({
      label: header,
      property: header.toLowerCase(),
      width: 80 + extraWidthPerColumn, // Aumentar el ancho de cada columna
      renderer: null,
    })),
    rows: tableData.map((data) => data.map((cell) => String(cell))),
  };

  // Generar la tabla en el documento PDF
  doc.moveDown(1);
  doc.table(table, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
    prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
      doc.font('Helvetica').fontSize(10);
    },
    borderHorizontalWidths: (i) => 0.8,
    borderVerticalWidths: (i) => 0.8,
    borderColor: (i) => (i === -1 ? 'black' : 'gray'),
    padding: 10,
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });
}

const createPrimaryClasses = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;
    const profileId = body.profileId; // Asegúrate de obtener el profileId desde el cuerpo de la solicitud

    // Verificar si todos los campos necesarios están presentes
    if (!gymId || !profileId) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    // Generar el número secuencial para la clase primaria
    const gymClassSerialNumber = await generatePrimarySequentialNumber(gymId);
    const classId = `primaryClass-${gymId}-${gymClassSerialNumber}`;

    // Crear un objeto de clase para una única entrada con todos los días de la semana
    const classObj = {
      classId: classId,
      gymId: gymId,
      className: body.className,
      startTime: body.startTime,
      endTime: body.endTime,
      eventColor: body.eventColor,
      weekDays: Array.from({ length: 7 }, (_, i) =>
        body.selectedWeekDays.includes(i)
      ),
      selectedWeekDays: body.selectedWeekDays,
      selectTrainer: body.selectTrainer,
      limitCapacity: body.limitCapacity,
      classCapacity: body.classCapacity,
      description: body.description,
      unknownClassCapacity: body?.unknownClassCapacity,
    };

    if (body.memberRestrictions) {
      classObj.memberRestrictions = {
        restrictions: body.memberRestrictions.restrictions || false,
        maxCancellationsPer30Days:
          body.memberRestrictions.maxCancellationsPer30Days || null,
        maxNoShowPer30Days: body.memberRestrictions.maxNoShowPer30Days || null,
        penaltyType: body.memberRestrictions.penaltyType || null,
        monetaryAmount: body.memberRestrictions.monetaryAmount || null,
        timeRestrictionDays:
          body.memberRestrictions.timeRestrictionDays || null,
        penaltyWaiveUnit: body.memberRestrictions.penaltyWaiveUnit || 'days',
        penaltyWaiveDays: body.memberRestrictions.penaltyWaiveDays || 1,
        penaltyWaiveHours: body.memberRestrictions.penaltyWaiveHours || null,
      };
    }

    if (body.nonMemberRestrictions) {
      classObj.nonMemberRestrictions = {
        restrictions: body.nonMemberRestrictions.restrictions || false,
        maxNonMembersCancellations:
          body.nonMemberRestrictions.maxNonMembersCancellations || null,
        nonMemberCreditsPenalty:
          body.nonMemberRestrictions.nonMemberCreditsPenalty || null,
        maxNonMembersNoShows:
          body.nonMemberRestrictions.maxNonMembersNoShows || null,
        penaltyNonMemberWaiveUnit:
          body.nonMemberRestrictions.penaltyNonMemberWaiveUnit || 'days',
        penaltyNonMemberWaiveDays:
          body.nonMemberRestrictions.penaltyNonMemberWaiveDays || 1,
        penaltyNonMemberWaiveHours:
          body.nonMemberRestrictions.penaltyNonMemberWaiveHours || null,
      };
    }

    // Guardar la clase en la base de datos
    const primaryClassesCollection = db.collection('primaryClasses');
    const newClassRef = primaryClassesCollection.doc(classId);
    await newClassRef.set(classObj);

    // Actualizar el número secuencial en la colección de gimnasios
    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      primaryClassLastSerialNumber: gymClassSerialNumber,
    });

    // Registrar el movimiento
    await logMovement(
      profileId, // ID del perfil que realiza la acción
      gymId, // ID del gimnasio
      'primaryClass', // Sección afectada
      'create', // Acción realizada
      [classId], // Clases afectadas (en este caso, una sola clase)
      [] // Perfiles afectados (vacío porque no se afectan perfiles directamente)
    );

    res.status(201).json({
      message: 'Primary class created successfully',
      class: classObj,
    });
  } catch (error) {
    console.error('Error creating primary class:', error);
    res.status(500).json({
      message: 'An error occurred while creating the primary class',
    });
  }
};

async function generatePrimarySequentialNumber(gymId) {
  // Consulta la colección "metadata" para obtener el último número secuencial
  const metadataRef = db.collection('gyms').doc(gymId);
  const metadataDoc = await metadataRef.get();
  let gymPrimaryClasses = 1;

  if (metadataDoc.exists) {
    const data = metadataDoc.data();
    gymPrimaryClasses = data.gymPrimaryClasses + 1;
  }

  // Actualiza el número de secuencia en "metadata"
  await metadataRef.set({ gymPrimaryClasses }, { merge: true });

  // Devuelve el número secuencial formateado
  return gymPrimaryClasses;
}

const getAllprimaryClasses = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getClassesCollection = db.collection('primaryClasses');

    const response = await getClassesCollection
      .where('gymId', '==', gymId)
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const classesArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const membership = {
        id: doc.id,
        classId: data.classId,
        description: data.description, // Si descriptions no está definido, usar un array vacío
        gymId: data.gymId, // Si gymId no está definido, usar una cadena vacía
        classCapacity: data.classCapacity,
        className: data.className,
        selectedWeekDays: data.selectedWeekDays,
        selectTrainer: data.selectTrainer, // Si planName no está definido, usar una cadena vacía
        startTime: data.startTime,
        endTime: data.endTime,
        eventColor: data.eventColor,
        limitCapacity: data.limitCapacity,
        weekDays: data.weekDays,
        unknownClassCapacity: data?.unknownClassCapacity,
      };
      if (data.memberRestrictions?.restrictions) {
        membership.memberRestrictions = {
          restrictions: data.memberRestrictions.restrictions,
          maxCancellationsPer30Days:
            data.memberRestrictions.maxCancellationsPer30Days,
          maxNoShowPer30Days: data.memberRestrictions.maxNoShowPer30Days,
          penaltyType: data.memberRestrictions.penaltyType,
          monetaryAmount: data.memberRestrictions.monetaryAmount,
          timeRestrictionDays: data.memberRestrictions.timeRestrictionDays,
          penaltyWaiveUnit: data.memberRestrictions.penaltyWaiveUnit,
          penaltyWaiveDays: data.memberRestrictions.penaltyWaiveDays,
          penaltyWaiveHours: data.memberRestrictions.penaltyWaiveHours,
        };
      }

      // Verificar restricciones de no miembros y añadirlas solo si son verdaderas
      if (data.nonMemberRestrictions?.restrictions) {
        membership.nonMemberRestrictions = {
          restrictions: data.nonMemberRestrictions.restrictions,
          maxNonMembersCancellations:
            data.nonMemberRestrictions.maxNonMembersCancellations,
          nonMemberCreditsPenalty:
            data.nonMemberRestrictions.nonMemberCreditsPenalty,
          maxNonMembersNoShows: data.nonMemberRestrictions.maxNonMembersNoShows,
          penaltyNonMemberWaiveUnit:
            data.nonMemberRestrictions.penaltyNonMemberWaiveUnit,
          penaltyNonMemberWaiveDays:
            data.nonMemberRestrictions.penaltyNonMemberWaiveDays,
          penaltyNonMemberWaiveHours:
            data.nonMemberRestrictions.penaltyNonMemberWaiveHours,
        };
      }

      classesArray.push(membership);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(classesArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

const changeMemberAttendanceStatus = async (req, res) => {
  const { memberId, classId, gymId, profileId } = req.body;

  try {
    // Referencias a las colecciones
    const profilesRef = db.collection('profiles').doc(memberId); // Perfil del cliente
    const classRef = db.collection('classes').doc(classId);
    const attendanceHistoryRef = db.collection('attendanceHistory');

    // Obtener el perfil del cliente
    const profileDoc = await profilesRef.get();
    if (!profileDoc.exists) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    const profileData = profileDoc.data();
    const cardSerialNumber = profileData.cardSerialNumber;
    const profileName = profileData.profileName;
    const profileLastname = profileData.profileLastname;

    // Obtener la clase
    const classDoc = await classRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found.' });
    }

    const classData = classDoc.data();

    // Obtener la subcolección de participants
    const participantsCollectionRef = classRef.collection('participants');

    // Buscar el participante en la subcolección
    const participantQuery = await participantsCollectionRef
      .where('profileId', '==', memberId)
      .get();

    if (participantQuery.empty) {
      return res
        .status(404)
        .json({ message: 'Participant not found in the class.' });
    }

    const participantDoc = participantQuery.docs[0];
    const participant = participantDoc.data();
    const attendanceStatus = participant.attendance;

    if (attendanceStatus === false) {
      // Crear el registro en attendanceHistory
      await attendanceHistoryRef.add({
        gymId: gymId,
        activityId: classId,
        profileId: memberId, // ID del cliente
        cardSerialNumber: cardSerialNumber,
        attendanceDate: new Date(),
        role: 'member',
      });

      // Actualizar el estado de asistencia a true en la subcolección
      await participantDoc.ref.update({ attendance: true });

      // Registrar el movimiento
      await logMovement(
        profileId,
        gymId,
        'classAttendance',
        'statusModifiedToTrue',
        [classId],
        [memberId]
      );

      // Responder con los datos actualizados
      res.status(200).json({
        message: 'Attendance marked successfully.',
        profileName: profileName,
        profileLastname: profileLastname,
        className: classData.className,
        startTime: classData.startTime,
        endTime: classData.endTime,
        attendance: true,
      });
    } else if (attendanceStatus === true) {
      // Cambiar el estado de asistencia a false en la subcolección
      await participantDoc.ref.update({ attendance: false });

      // Eliminar el registro correspondiente en attendanceHistory
      const historySnapshot = await attendanceHistoryRef
        .where('gymId', '==', gymId)
        .where('activityId', '==', classId)
        .where('profileId', '==', memberId) // ID del cliente
        .get();

      const batch = db.batch();
      historySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Registrar el movimiento
      await logMovement(
        profileId,
        gymId,
        'classAttendance',
        'statusModifiedToFalse',
        [classId],
        [memberId]
      );

      // Responder con los datos actualizados
      res.status(200).json({
        message: 'Attendance cancelled successfully.',
        profileName: profileName,
        profileLastname: profileLastname,
        className: classData.className,
        startTime: classData.startTime,
        endTime: classData.endTime,
        attendance: false,
      });
    } else {
      res.status(400).json({ message: 'Invalid attendance status.' });
    }
  } catch (error) {
    console.error('Error handling attendance:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const updateUserPositions = async (req, res) => {
  try {
    const { users, classId, currentListType, gymId, profileId } = req.body;

    // Definir qué subcolección actualizar según currentListType
    const listField =
      currentListType === 'waitingNonMembers'
        ? 'unknownWaitingList'
        : 'waitingList';

    // Verificar que classId esté presente
    if (!classId) {
      return res.status(400).send({ message: 'classId es requerido.' });
    }

    // Obtener el documento de la clase
    const classDocRef = db.collection('classes').doc(classId);
    const classDoc = await classDocRef.get();

    if (!classDoc.exists) {
      return res.status(404).send({ message: 'Clase no encontrada.' });
    }

    // Obtener la referencia de la subcolección
    const listRef = classDocRef.collection(listField);

    // Verificar que users esté presente y sea un arreglo
    if (!Array.isArray(users)) {
      return res.status(400).send({ message: 'users debe ser un arreglo.' });
    }

    // Crear un batch para las actualizaciones
    const batch = db.batch();
    const updatedProfiles = [];

    // Iterar sobre los usuarios para actualizar sus posiciones
    for (const user of users) {
      // Verificar que user.profileId esté presente
      if (!user.profileId) {
        continue; // O puedes enviar un error si prefieres
      }

      // Buscar el documento del usuario en la subcolección
      const userDocRef = listRef.doc(user.profileId);
      const userDoc = await userDocRef.get();

      if (userDoc.exists) {
        // Actualizar la posición del usuario
        batch.update(userDocRef, { position: user.position });
        updatedProfiles.push(user.profileId); // Guardar el ID del perfil actualizado
      } else {
        console.warn(
          `Usuario con profileId ${user.profileId} no encontrado en ${listField}.`
        );
      }
    }

    // Ejecutar el batch de actualizaciones
    await batch.commit();

    // Registrar el movimiento
    await logMovement(
      profileId,
      gymId,
      currentListType, // Usar la lista actual como sección
      'updatePositions', // Acción realizada
      [classId], // Clase afectada
      updatedProfiles // IDs de los perfiles afectados
    );

    res.status(200).send({ message: 'Posiciones actualizadas correctamente.' });
  } catch (error) {
    console.error('Error al actualizar posiciones:', error.message);
    res.status(500).send({ message: 'Error al actualizar posiciones.' });
  }
};

const removeUnknownMemberFromWaitingList = async (req, res) => {
  const { deletedProfileId, classId, profileId, gymId } = req.body;

  try {
    // Referencia a la colección de clases y al documento específico
    const classRef = db.collection('classes').doc(classId);
    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // Referencia a la subcolección unknownWaitingList
    const waitingListRef = classRef.collection('unknownWaitingList');
    const snapshot = await waitingListRef
      .where('profileId', '==', deletedProfileId)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ error: 'Profile not found in waiting list' });
    }

    // Eliminar el perfil de la lista de espera
    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    await logMovement(
      profileId, // ID del perfil que está realizando la acción
      gymId, // ID del gimnasio
      'classes', // Sección afectada
      'removeNonMemberWaitingList', // Acción realizada
      [classId], // Clases afectadas
      [deletedProfileId] // Perfiles afectados
    );

    return res
      .status(200)
      .json({ message: 'Member removed from waiting list successfully' });
  } catch (error) {
    console.error('Error removing member from waiting list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
const removeMemberFromWaitingList = async (req, res) => {
  const { deletedProfileId, classId, profileId, gymId } = req.body;

  if (!deletedProfileId || !classId) {
    return res
      .status(400)
      .json({ error: 'Profile ID and class ID are required' });
  }

  try {
    // Referencia a la colección de clases y a la subcolección waitingList
    const classRef = db.collection('classes').doc(classId);
    const waitingListRef = classRef
      .collection('waitingList')
      .doc(deletedProfileId);

    // Verificar si el documento existe
    const waitingListDoc = await waitingListRef.get();

    if (!waitingListDoc.exists) {
      return res
        .status(404)
        .json({ error: 'Member not found in waiting list' });
    }

    // Eliminar el miembro de la lista de espera
    await waitingListRef.delete();

    // Registrar la eliminación en los logs
    await logMovement(
      profileId, // ID del perfil que está realizando la acción
      gymId, // ID del gimnasio
      'classes', // Sección afectada
      'removeMemberFromWaitingList', // Acción realizada
      [classId], // Clases afectadas
      [deletedProfileId] // Perfiles afectados
    );

    return res
      .status(200)
      .json({ message: 'Member successfully removed from waiting list' });
  } catch (error) {
    console.error('Error removing member from waiting list:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const addClassMemberWaitingList = async (req, res) => {
  try {
    const { memberForm, classId, profileId, gymId } = req.body;

    // Encontrar el miembro que se va a agregar
    const participantAdded = memberForm.find(
      (participant) => participant.profileId === profileId
    );

    if (!participantAdded) {
      return res.status(400).json({
        message: 'Member with the provided profileId not found',
      });
    }

    const participantProfileId = participantAdded.profileId;

    // Referencia al documento de la clase
    const classDocRef = db.collection('classes').doc(classId);
    const classDoc = await classDocRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Referencia a la colección de la lista de espera de miembros
    const waitingListCollection = classDocRef.collection('waitingList');

    // Verificar si el perfil ya está en la lista de espera
    const existingProfile = await waitingListCollection.doc(profileId).get();
    if (existingProfile.exists) {
      return res.status(400).json({
        message: 'Profile is already on the waiting list',
      });
    }

    // Obtener la siguiente posición en la lista de espera
    const waitingListSnapshot = await waitingListCollection
      .orderBy('position', 'desc')
      .limit(1)
      .get();

    const nextPosition = waitingListSnapshot.empty
      ? 1
      : waitingListSnapshot.docs[0].data().position + 1;

    // Crear el objeto del miembro que se va a agregar
    const waitingMember = {
      ...participantAdded,
      position: nextPosition,
      addedAt: new Date().toISOString(),
    };

    // Agregar el miembro a la lista de espera
    await waitingListCollection.doc(profileId).set(waitingMember);

    // Registrar el movimiento en el log
    await logMovement(
      profileId,
      gymId,
      'classes',
      'addMemberToWaitingList',
      [classId],
      [participantProfileId]
    );

    return res.status(200).json({
      message: 'Member successfully added to the waiting list',
      member: waitingMember,
    });
  } catch (error) {
    console.error('Error adding member to waiting list:', error);
    return res.status(500).json({
      message: 'Internal server error while adding member to the waiting list',
    });
  }
};

const addClassUnknownWaitingList = async (req, res) => {
  try {
    const { memberForm, classId, profileId, gymId } = req.body;

    // Find the participant to be added
    const participantAdded = memberForm.find(
      (participant) => participant.profileId === profileId
    );

    if (!participantAdded) {
      return res.status(400).json({
        message: 'Participant with the provided profileId not found',
      });
    }
    const participantProfileId = participantAdded.profileId;

    // Validate currentCredit, deductedAtBooking, and prepaymentType
    const { currentCredit, deductedAtBooking, prepaymentType } =
      participantAdded.selectedPackage;

    if (currentCredit === 0) {
      return res.status(400).json({
        message: 'This member does not have available credit',
      });
    }

    if (prepaymentType !== 1 && prepaymentType !== 3) {
      return res.status(400).json({
        message: "This member's package does not allow booking this class",
      });
    }

    if (deductedAtBooking) {
      participantAdded.currentCredit--;

      const profileRef = db.collection('profiles').doc(profileId);
      await profileRef.update({
        currentCredit: admin.firestore.FieldValue.increment(-1),
      });
    }

    const classDocRef = db.collection('classes').doc(classId);
    const classDoc = await classDocRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const waitingListCollection = classDocRef.collection('unknownWaitingList');

    const existingProfile = await waitingListCollection.doc(profileId).get();
    if (existingProfile.exists) {
      return res.status(400).json({
        message: 'Profile is already on the waiting list',
      });
    }

    const waitingListSnapshot = await waitingListCollection
      .orderBy('position', 'desc')
      .limit(1)
      .get();

    const nextPosition = waitingListSnapshot.empty
      ? 1
      : waitingListSnapshot.docs[0].data().position + 1;

    const waitingMember = {
      ...participantAdded,
      position: nextPosition,
      addedAt: new Date().toISOString(),
    };

    await waitingListCollection.doc(profileId).set(waitingMember);

    await logMovement(
      profileId,
      gymId,
      'classes',
      'addNonMemberToWaitingList',
      [classId],
      [participantProfileId]
    );

    return res.status(200).json({
      message: 'Profile successfully added to the waiting list',
      member: waitingMember,
    });
  } catch (error) {
    console.error('Error adding profile to waiting list:', error);
    return res.status(500).json({
      message: 'Internal server error while adding profile to the waiting list',
    });
  }
};

module.exports = {
  createClass,
  createPrimaryClasses,
  getAllClasses,
  getAllprimaryClasses,
  getWeekClasses,
  deleteClass,
  deletePrimaryClass,
  deleteAllClasses,
  updateClass,
  updateUserPositions,
  updateAllClasses,
  updatePrimaryClasses,
  generateClassReport,
  getTrainers,
  changeMemberAttendanceStatus,
  addClassUnknownWaitingList,
  addClassMemberWaitingList,
  addParticipants,
  removeParticipant,
  cancelClass,
  getTodaysClasses,
  addUnknownParticipants,
  removeUnknownMemberFromWaitingList,
  removeMemberFromWaitingList,
  removeUnknownParticipant,
};
