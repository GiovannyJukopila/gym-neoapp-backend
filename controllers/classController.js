const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const moment = require('moment');
const PDFDocument = require('pdfkit-table');
const { format, parseISO } = require('date-fns');
app.use(bodyParser.json());

const createClass = async (req, res) => {
  try {
    const body = req.body;
    const gymId = req.query.gymId;

    const eventDate = new Date(body.eventDate);

    // Verificar si expirationDate es diferente de null
    if (body.expirationDate !== null) {
      const expirationDate = new Date(body.expirationDate);
      const gymClassSerialNumber = await generateSequentialNumber(gymId);
      const personalClassId = `personal-class-${gymId}-${gymClassSerialNumber}-${
        eventDate.toISOString().split('T')[0]
      }-${expirationDate.toISOString().split('T')[0]}`;
      // Crear un arreglo para almacenar las clases
      const classes = [];

      // Iterar sobre cada día entre eventDate y expirationDate
      const currentDate = new Date(eventDate);
      while (currentDate <= expirationDate) {
        // Verificar si el día actual es uno de los días seleccionados
        const dayOfWeek = currentDate.getDay(); // Domingo: 0, Lunes: 1, ..., Sábado: 6
        if (body.selectedWeekDays.includes(dayOfWeek)) {
          // Generar el número secuencial utilizando la función
          const classSerialNumber = await generateSequentialNumber(gymId);

          // Generar el nombre del documento
          const classId = `class-${gymId}-${classSerialNumber}`;

          // Crear un objeto de clase para este día
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
            unknownClassCapacity: body?.unknownClassCapacity, // Se establece el día de la semana correspondiente
            // Agregar aquí otros elementos específicos para cada clase
            // ...
          };

          // Agregar la clase al arreglo de clases
          classes.push(classObj);
        }

        // Incrementar la fecha para el próximo día
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Crear clase para el día de expiración
      const expirationDayOfWeek = expirationDate.getDay();
      if (body.selectedWeekDays.includes(expirationDayOfWeek)) {
        // Generar el número secuencial utilizando la función
        const expirationClassSerialNumber = await generateSequentialNumber(
          gymId
        );

        // Generar el nombre del documento para la clase de expiración
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
          unknownClassCapacity: body?.unknownClassCapacity, // Se establece el día de la semana correspondiente
          // Agregar aquí otros elementos específicos para la clase de expiración
          // ...
        };
        classes.push(expirationClassObj);
      }

      // Guardar todas las clases en la base de datos
      const profilesCollection = db.collection('classes');
      const batch = db.batch();
      classes.forEach((classObj) => {
        const classRef = profilesCollection.doc(classObj.classId);
        batch.set(classRef, classObj);
      });
      await batch.commit();

      res.status(201).json({
        message: 'Classes created successfully',
        classes: classes,
      });
    } else if (body.selectedWeekDays && body.selectedWeekDays.length > 0) {
      // Si no hay expirationDate pero hay días seleccionados, creamos clases para esos días

      // Generar el número secuencial utilizando la función
      const gymClassSerialNumber = await generateSequentialNumber(gymId);
      const personalClassId = `personal-class-${gymId}-${gymClassSerialNumber}-${
        eventDate.toISOString().split('T')[0]
      }`;

      // Crear un arreglo para almacenar las clases
      const classes = [];

      // Iterar sobre cada día seleccionado en body.selectedWeekDays
      for (const dayOfWeek of body.selectedWeekDays) {
        // Generar el número secuencial utilizando la función
        const classSerialNumber = await generateSequentialNumber(gymId);

        // Generar el nombre del documento
        const classId = `class-${gymId}-${classSerialNumber}`;

        // Crear un objeto de clase para este día
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
          unknownClassCapacity: body?.unknownClassCapacity, // Se establece el día de la semana correspondiente
          // Agregar aquí otros elementos específicos para cada clase
          // ...
        };

        // Agregar la clase al arreglo de clases
        classes.push(classObj);
      }

      // Guardar todas las clases en la base de datos
      const profilesCollection = db.collection('classes');
      const batch = db.batch();
      classes.forEach((classObj) => {
        const classRef = profilesCollection.doc(classObj.classId);
        batch.set(classRef, classObj);
      });
      await batch.commit();

      res.status(201).json({
        message: 'Classes created successfully',
        classes: classes,
      });
    } else {
      // Si expirationDate es null, crear una sola clase
      const classSerialNumber = await generateSequentialNumber(gymId);
      const documentName = `class-${gymId}-${classSerialNumber}`;
      body.classId = documentName;

      const profilesCollection = db.collection('classes');
      const newProfileRef = profilesCollection.doc(documentName);
      await newProfileRef.set(body);

      const gymsCollection = db.collection('gyms');
      await gymsCollection.doc(gymId).update({
        classLastSerialNumber: documentName,
      });

      res.status(201).json({
        message: 'Class created successfully',
        documentName,
        body,
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

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getClassesCollection = db.collection('classes');

    const currentMonthStart = moment().startOf('month');
    const prevMonthStart = moment(currentMonthStart)
      .subtract(1, 'months')
      .startOf('month');
    const nextMonthEnd = moment(currentMonthStart)
      .add(1, 'months')
      .endOf('month');

    const response = await getClassesCollection
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', prevMonthStart.format())
      .where('eventDate', '<=', nextMonthEnd.format())
      .get();

    const classesArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const membership = {
        id: doc.id,
        classId: data.classId,
        description: data.description, // Si descriptions no está definido, usar un array vacío
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
        personalClassId: data?.personalClassId,
        unknownClassCapacity: data?.unknownClassCapacity,
        unknownParticipants: data?.unknownParticipants,
        currentUnkwnownClassParticipants:
          data?.currentUnkwnownClassParticipants,
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

const deleteAllClasses = async (req, res) => {
  try {
    const gymId = req.body.gymId; // Obtiene el gymId del cuerpo de la solicitud
    const personalClassId = req.params.personalClassId; // Obtiene el personalClassId de los parámetros de la URL

    // Obtener todas las clases asociadas con el personalClassId
    const classesSnapshot = await db
      .collection('classes')
      .where('gymId', '==', gymId)
      .where('personalClassId', '==', personalClassId)
      .get();

    const failedClasses = []; // Almacenar las clases que no se pueden eliminar

    const batch = db.batch();
    classesSnapshot.forEach((classDoc) => {
      const classData = classDoc.data();
      // Verificar si la clase tiene participantes
      if (classData.participants && classData.participants.length > 0) {
        // La clase tiene participantes, por lo que no se puede eliminar
        failedClasses.push({
          eventDate: classData.eventDate, // Guardar la fecha de la clase que no se puede eliminar
        });
      } else {
        // La clase no tiene participantes, se puede eliminar
        batch.delete(classDoc.ref);
      }
    });

    await batch.commit();

    if (failedClasses.length > 0) {
      // Devolver las clases que no se pudieron eliminar debido a que tienen participantes
      res.status(400).json({
        message: `Some classes associated with personalClassId ${personalClassId} have participants and cannot be deleted`,
        failedClasses: failedClasses,
      });
    } else {
      res.status(200).json({
        message: `Classes associated with personalClassId ${personalClassId} deleted successfully`,
      });
    }
  } catch (error) {
    console.error('Error deleting classes:', error);
    res.status(500).json({
      message: 'An error occurred while deleting the classes',
    });
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

const addUnknownParticipants = async (req, res) => {
  try {
    const participants = req.body.memberForm; // Extraer la lista de participantes de req.body.memberForm
    const profileId = req.body.profileId;
    const participantAdded = req.body.memberForm.filter(
      (participant) => participant.profileId === profileId
    );

    if (participantAdded.length === 0) {
      return res.status(400).json({
        message:
          'No se encontraron participantes con el profileId proporcionado',
      });
    }

    const deductedAtBooking =
      participantAdded[0].selectedPackage.deductedAtBooking;
    const prepaymentType = participantAdded[0].selectedPackage.prepaymentType;
    const currentCredit = participantAdded[0].currentCredit;

    if (currentCredit === 0) {
      return res.status(400).json({
        message: 'This member does not have available credit',
      });
    }

    if (prepaymentType !== 1 && prepaymentType !== 3) {
      return res.status(400).json({
        message: 'This members package does not allow creating classes',
      });
    }

    if (deductedAtBooking) {
      // Restar 1 crédito del currentCredit del memberForm
      participantAdded[0].currentCredit--;

      // Actualizar el currentCredit en el perfil de la persona
      const profileRef = db.collection('profiles').doc(profileId);
      await profileRef.update({
        currentCredit: admin.firestore.FieldValue.increment(-1),
      });
    }

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
        unknownParticipants: participants,
        currentUnkwnownClassParticipants: 1,
      });

      return res.status(200).json({
        message: 'Participantes agregados con éxito',
        currentUnkwnownClassParticipants: 1,
      });
    }

    // Obtiene el campo de participantes actual
    const currentParticipants = classDoc.data().unknownParticipants || [];

    // Actualiza el campo de participantes utilizando arrayUnion
    await classDocRef.update({
      unknownParticipants: admin.firestore.FieldValue.arrayUnion(
        ...participants
      ),
      currentUnkwnownClassParticipants: currentParticipants.length + 1,
    });

    return res.status(200).json({
      message: 'Participantes agregados con éxito',
      currentUnkwnownClassParticipants: currentParticipants.length + 1,
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

const removeUnknownParticipant = async (req, res) => {
  try {
    const { deletedProfileId, classId } = req.body;

    // Obtén una referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén una referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();
    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Obtén los participantes actuales de la clase
    const currentParticipants = classDoc.data().unknownParticipants || [];

    // Filtra los participantes para excluir al participante con deletedProfileId
    const updatedParticipants = currentParticipants.filter(
      (participant) => participant.profileId !== deletedProfileId
    );

    // Actualiza el campo de participantes en el documento de la clase
    await classDocRef.update({
      unknownParticipants: updatedParticipants,
      currentUnkwnownClassParticipants: updatedParticipants.length,
    });

    // Obtiene la clase actualizada para contar el número de participantes
    const updatedClassDoc = await classDocRef.get();
    const currentClassParticipants =
      updatedClassDoc.data().unknownParticipants.length;

    // Devuelve una respuesta exitosa junto con el nuevo número de participantes
    res.status(200).json({
      message: 'Participante eliminado con éxito',
      currentUnkwnownClassParticipants: currentClassParticipants,
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

    // Convertir filterDate a un objeto Moment
    const initialDate = moment(filterDate);

    // Calcular la fecha de inicio de la semana (lunes a las 12 AM)
    let startOfWeek = initialDate
      .clone()
      .startOf('week')
      .add(1, 'days')
      .startOf('day');

    // Calcular la fecha de finalización de la semana (domingo a las 11:59 PM)
    let endOfWeek = initialDate.clone().endOf('week').endOf('day');

    // Ajustar el inicio de la semana a partir del día actual si no es lunes
    if (initialDate.isAfter(startOfWeek)) {
      startOfWeek = initialDate.clone().startOf('day');
    }

    const classesRef = admin.firestore().collection('classes');

    // Consultar las clases filtradas por gymId y eventDate
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', startOfWeek.format('YYYY-MM-DD'))
      .where('eventDate', '<=', endOfWeek.format('YYYY-MM-DD'))
      .get();

    // Extraer los datos de los documentos encontrados
    const classesWithinWeek = [];
    snapshot.forEach((doc) => {
      classesWithinWeek.push(doc.data());
    });

    // Devolver las clases encontradas en la respuesta
    res.status(200).json(classesWithinWeek);
  } catch (error) {
    console.error(error);
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
    const participants = classData.participants || [];
    const unknownParticipants = classData.unknownParticipants || [];

    // Obtén los datos de los perfiles de los participantes
    const participantsPromises = participants.map((participant) =>
      db.collection('profiles').doc(participant.profileId).get()
    );
    const participantDocs = await Promise.all(participantsPromises);
    const participantProfiles = participantDocs.map((doc) => doc.data());

    // Obtén los datos de los perfiles de los non members
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
    const attendanceQuerySnapshot = await db
      .collection('attendanceHistory')
      .where('activityId', '==', classId)
      .get();

    const nonMemberAttendanceData = attendanceQuerySnapshot.docs.map((doc) => ({
      profileId: doc.data().profileId,
      attendanceDate: doc.data().attendanceDate,
      currentCredit: doc.data().currentCredit,
      cardSerialNumber: doc.data().cardSerialNumber,
    }));

    const nonMemberAttendanceProfileIds = attendanceQuerySnapshot.docs.map(
      (doc) => doc.data().profileId
    );

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
      .map(
        (doc) => (doc.exists ? doc.data() : null) // Manejo de documentos vacíos
      )
      .filter((profile) => profile !== null); // Filtrar perfiles nulos

    // Crear un nuevo documento PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="class_report.pdf"');
    doc.pipe(res);

    // Encabezado del documento
    doc.rect(0, 0, 612, 80).fill('#FFA500');
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
    doc.fontSize(18).text(`${formattedEventDateTime}`, {
      bold: true,
    });

    doc.moveDown(); // Mover más abajo
    doc.fillColor('black');
    doc.fontSize(12); // Cambiar color a negro
    doc.text(`• Total Members Participants: ${participants.length}`);
    doc.text(`• Total Non-Members Participants: ${unknownParticipants.length}`);
    doc.moveDown();

    // Tabla de miembros participantes
    if (participantProfiles.length > 0) {
      const membersTableData = participantProfiles.map((profile) => [
        `${profile.profileName || 'N/A'} ${profile.profileLastname || 'N/A'}`,
        profile.profileEmail || 'N/A',
        profile.cardSerialNumber || 'N/A',
        profile.profileTelephoneNumber || 'N/A',
      ]);

      const membersTableHeaders = [
        'Name',
        'Email',
        'Card Serial Number',
        'Telephone',
      ];

      await generateTable(
        'Members Participants',
        membersTableHeaders,
        membersTableData,
        doc
      );
      doc.moveDown();
    }

    // Tabla de no miembros participantes
    if (unknownParticipantProfiles.length > 0) {
      const unknownTableData = unknownParticipantProfiles.map((profile) => [
        `${profile.profileName || 'N/A'}`,
        profile.unknownMemberEmail || 'N/A',
        profile.cardSerialNumber || 'N/A',
        profile.unknownMemberPhoneNumber || 'N/A',
      ]);

      const unknownTableHeaders = [
        'Name',
        'Email',
        'Card Serial Number',
        'Telephone',
      ];

      await generateTable(
        'Non-Members Participants',
        unknownTableHeaders,
        unknownTableData,
        doc
      );
      doc.moveDown();
    }

    // Tabla de asistencia de no miembros
    if (nonMemberProfilesData.length > 0) {
      await generateNonMembersAttendanceTable(
        nonMemberProfilesData,
        nonMemberAttendanceData,
        doc
      );
      doc.moveDown();
    }

    // Finalizar el documento
    doc.end();
  } catch (error) {
    console.error('Error generating class report:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Función para generar la tabla de Non-Members Attendance
// En la función generateNonMembersAttendanceTable
const generateNonMembersAttendanceTable = async (
  nonMemberProfilesData,
  nonMemberAttendanceData,
  doc
) => {
  const nonMembersAttendanceTableData = nonMemberProfilesData.map(
    (profile, index) => [
      `${profile.profileName || 'N/A'}`,
      profile.unknownMemberEmail || 'N/A',
      'Attended', // Estado de asistencia ajustado según necesidades
      nonMemberAttendanceData[index].attendanceDate
        ? formatTimestamp(nonMemberAttendanceData[index].attendanceDate)
        : 'N/A', // Formatear la fecha de asistencia
      `${nonMemberAttendanceData[index].currentCredit || 'N/A'}`, // Crédito actual
      `${nonMemberAttendanceData[index].cardSerialNumber || 'N/A'}`, // Número de tarjeta
    ]
  );

  const nonMembersAttendanceTableHeaders = [
    'Name',
    'Email',
    'Attendance Status',
    'Attendance Date',
    'Current Credit',
    'Card Serial Number',
  ];

  await generateTable(
    'Non-Members Attendance',
    nonMembersAttendanceTableHeaders,
    nonMembersAttendanceTableData,
    doc
  );
};

// Función para generar la tabla genérica
const generateTable = async (title, headers, rows, doc) => {
  const table = {
    title,
    headers: headers.map((header, i) => ({
      label: header,
      property: `header_${i}`,
      width: 80,
      renderer: null,
    })),
    rows: rows.map((row) => row.map((cell) => String(cell))), // Convertir todos los elementos a cadena
  };

  doc.table(table, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
    prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
      doc.font('Helvetica').fontSize(10);
      doc.text(row[`header_${indexColumn}`], rectCell.x + 5, rectCell.y + 5);
    },
    borderHorizontalWidths: (i) => 0.8,
    borderVerticalWidths: (i) => 0.8,
    borderColor: (i) => (i === -1 ? 'black' : 'gray'),
    padding: 10,
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
  });
};
const formatTimestamp = (timestamp) => {
  if (!timestamp || !timestamp.toDate) {
    return 'N/A'; // Manejo para casos donde el timestamp no sea válido
  }
  const dateObject = timestamp.toDate(); // Convertir el Timestamp a un objeto Date
  return dateObject.toLocaleString(); // Formatear la fecha como string legible
};
module.exports = {
  createClass,
  getAllClasses,
  getWeekClasses,
  deleteClass,
  deleteAllClasses,
  updateClass,
  generateClassReport,
  getTrainers,
  addParticipants,
  removeParticipant,
  cancelClass,
  getTodaysClasses,
  addUnknownParticipants,
  removeUnknownParticipant,
};
