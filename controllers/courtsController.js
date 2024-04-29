const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const moment = require('moment');

const {
  formatISO,
  startOfWeek,
  endOfWeek,
  isSameWeek,
  format,
} = require('date-fns');
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
        inactiveReason: data.inactiveReason,
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

const createSession = async (req, res) => {
  try {
    const body = req.body;
    const memberType = body.memberType;
    const gymId = req.query.gymId;
    // Genera el número secuencial utilizando la función
    const sessionSerialNumber = await generateSequentialSessionNumber(gymId);

    // Genera el nombre del documento
    const documentName = `session-${gymId}-${sessionSerialNumber}`;

    const courtSelected = db.collection('courts').doc(body.selectCourt);
    const courtSnapshot = await courtSelected.get();
    const courtName = courtSnapshot.get('courtName');

    body.courtName = courtName;
    body.sessionId = documentName;

    const maxBookingPerDay = courtSnapshot.get('maxBookingPerDay');
    const maxBookingPerWeek = courtSnapshot.get('maxBookingPerWeek');
    const feeIsActive = courtSnapshot.get('bookingFee');
    const eventDate = new Date(body.eventDate).toISOString().split('T')[0];
    // Validar si maxBookingPerDay y maxBookingPerWeek son diferentes de null

    if (memberType === 'unknownmember') {
      const firstParticipant = body.unknownParticipants[0];

      // Obtener los datos del primer participante
      const { selectedPackage, currentCredit } = firstParticipant;

      if (currentCredit === 0) {
        return res.status(400).json({
          error: 'This member does not have available credit',
        });
      }

      const prepaymentType = selectedPackage.prepaymentType;

      if (prepaymentType !== 2 && prepaymentType !== 3) {
        return res.status(400).json({
          error: 'This members package does not allow creating courts',
        });
      }

      if (
        maxBookingPerDay !== null &&
        maxBookingPerDay !== 0 &&
        maxBookingPerWeek !== null &&
        maxBookingPerWeek !== 0
      ) {
        // Obtener la fecha actual en formato YYYY-MM-DD

        // Consultar la colección paymentsHistory filtrando por la fecha del evento y el courtId seleccionado
        const paymentsSnapshotDay = await db
          .collection('sessionHistory')
          .where('gymId', '==', gymId)
          .where('createDate', '==', eventDate)
          .where('memberType', '==', 'unknownmember')
          .get();

        // Contar la cantidad de reservas para el perfil en la posición 0 de participants
        const participantProfileId = body?.unknownParticipants?.[0]?.profileId;
        const dailyReservationsCount = paymentsSnapshotDay.docs.reduce(
          (count, doc) =>
            doc.data()?.participants?.[0]?.profileId === participantProfileId
              ? count + 1
              : count,
          0
        );

        if (dailyReservationsCount >= maxBookingPerDay) {
          return res.status(400).json({
            error: 'Daily booking limit exceeded for this court and profile.',
          });
        }

        const startOfWeekDate = startOfWeek(new Date(eventDate), {
          weekStartsOn: 1,
        });
        const endOfWeekDate = endOfWeek(new Date(startOfWeekDate));

        const formattedStartOfWeekDate = format(startOfWeekDate, 'yyyy-MM-dd');
        const formattedEndOfWeekDate = format(endOfWeekDate, 'yyyy-MM-dd');

        // Consultar la colección sessionHistory filtrando por la fecha del evento y el participante
        const paymentsSnapshotWeek = await db
          .collection('sessionHistory')
          .where('gymId', '==', gymId)
          .where('createDate', '>=', formattedStartOfWeekDate)
          .where('createDate', '<=', formattedEndOfWeekDate)
          .where('memberType', '==', 'unknownmember')
          .get();

        const weeklyReservationsCount = paymentsSnapshotWeek.docs.reduce(
          (count, doc) =>
            doc.data()?.unknownParticipants?.[0]?.profileId ===
            participantProfileId
              ? count + 1
              : count,
          0
        );

        if (weeklyReservationsCount >= maxBookingPerWeek) {
          return res.status(400).json({
            error: 'Weekly booking limit exceeded for this court and profile.',
          });
        }
        // Resto del código...
      }
    } else {
      if (
        maxBookingPerDay !== null &&
        maxBookingPerDay !== 0 &&
        maxBookingPerWeek !== null &&
        maxBookingPerWeek !== 0
      ) {
        // Obtener la fecha actual en formato YYYY-MM-DD

        // Consultar la colección paymentsHistory filtrando por la fecha del evento y el courtId seleccionado
        const paymentsSnapshotDay = await db
          .collection('sessionHistory')
          .where('gymId', '==', gymId)
          .where('createDate', '==', eventDate)
          .where('memberType', '==', 'member')
          .get();

        // Contar la cantidad de reservas para el perfil en la posición 0 de participants
        const participantProfileId = body?.participants?.[0]?.profileId;
        const dailyReservationsCount = paymentsSnapshotDay.docs.reduce(
          (count, doc) =>
            doc.data()?.participants?.[0]?.profileId === participantProfileId
              ? count + 1
              : count,
          0
        );

        if (dailyReservationsCount >= maxBookingPerDay) {
          return res.status(400).json({
            error: 'Daily booking limit exceeded for this court and profile.',
          });
        }

        const startOfWeekDate = startOfWeek(new Date(eventDate), {
          weekStartsOn: 1,
        });
        const endOfWeekDate = endOfWeek(new Date(startOfWeekDate));

        const formattedStartOfWeekDate = format(startOfWeekDate, 'yyyy-MM-dd');
        const formattedEndOfWeekDate = format(endOfWeekDate, 'yyyy-MM-dd');

        // Consultar la colección sessionHistory filtrando por la fecha del evento y el participante
        const paymentsSnapshotWeek = await db
          .collection('sessionHistory')
          .where('gymId', '==', gymId)
          .where('createDate', '>=', formattedStartOfWeekDate)
          .where('createDate', '<=', formattedEndOfWeekDate)
          .where('memberType', '==', 'member')
          .get();

        const weeklyReservationsCount = paymentsSnapshotWeek.docs.reduce(
          (count, doc) =>
            doc.data()?.participants?.[0]?.profileId === participantProfileId
              ? count + 1
              : count,
          0
        );

        if (weeklyReservationsCount >= maxBookingPerWeek) {
          return res.status(400).json({
            error: 'Weekly booking limit exceeded for this court and profile.',
          });
        }
        // Resto del código...
      }
    }
    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };

    const overlappingSessions = await db
      .collection('sessionHistory')
      .where('gymId', '==', gymId)
      .where('createDate', '==', eventDate)
      .where('selectCourt', '==', body.selectCourt)
      .get();

    const conflict = overlappingSessions.docs.some((doc) => {
      const existingStartTime = doc.data().startTime;
      const existingEndTime = doc.data().endTime;

      const existingStartMinutes = timeToMinutes(existingStartTime);
      const existingEndMinutes = timeToMinutes(existingEndTime);
      const bodyStartMinutes = timeToMinutes(body.startTime);
      const bodyEndMinutes = timeToMinutes(body.endTime);

      // Verificar si hay superposiciones de horarios
      return (
        // Caso 1: La nueva sesión comienza antes y termina durante una sesión existente
        (bodyStartMinutes < existingStartMinutes &&
          bodyEndMinutes > existingStartMinutes &&
          bodyEndMinutes <= existingEndMinutes) ||
        // Caso 2: La nueva sesión comienza durante y termina durante una sesión existente
        (bodyStartMinutes >= existingStartMinutes &&
          bodyStartMinutes < existingEndMinutes &&
          bodyEndMinutes <= existingEndMinutes) ||
        // Caso 3: La nueva sesión comienza durante una sesión existente y termina después
        (bodyStartMinutes >= existingStartMinutes &&
          bodyStartMinutes < existingEndMinutes &&
          bodyEndMinutes > existingEndMinutes) ||
        // Caso 4: La nueva sesión comienza antes y termina después de una sesión existente
        (bodyStartMinutes < existingStartMinutes &&
          bodyEndMinutes > existingEndMinutes)
      );
    });

    if (conflict) {
      return res.status(400).json({
        error:
          'There is already a scheduled session with overlapping schedules on this day for the same court',
      });
    }

    // Crea el nuevo documento en la colección "memberships" en Firebase
    const profilesCollection = db.collection('sessionHistory');
    const newProfileRef = profilesCollection.doc(documentName);
    await newProfileRef.set(body);

    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      sessionLastSerialNumber: documentName,
    });

    if (feeIsActive && body?.participants?.length > 0) {
      const firstParticipant = body.participants[0];
      const paymentHistoryRef = db.collection('paymentHistory');
      const newPaymentHistoryDoc = paymentHistoryRef.doc();
      const paymentId = newPaymentHistoryDoc.id;

      // Obtener los datos del primer participante
      const { profileId, membershipId, profileName, profileLastname } =
        firstParticipant;

      // Crear un documento en la colección paymentHistory con el paymentAmount y los datos del primer participante
      const paymentHistoryData = {
        sessionId: documentName,
        paymentId: paymentId,
        participants: body.participants,
        memberType: body.memberType,
        roomNumber: body.roomNumber,
        eventDate: body.eventDate,
        gymId: body.gymId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentStartTime: req.body.endTime,
        paymentEndTime: req.body.startTime,
        paymentType: 'Court',
        paymentAmount: body.feeValue,
        paymentCourtId: body.selectCourt,
        // Agregar los datos del primer participante
        profileId: profileId,
        membershipId: membershipId,
        profileName: profileName,
        profileLastname: profileLastname,
        // ... (otros datos relacionados con el pago o historial)
      };
      await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);
    }
    if (feeIsActive && body?.unknownParticipants?.length > 0) {
      const firstParticipant = body.unknownParticipants[0];
      const paymentHistoryRef = db.collection('paymentHistory');
      const newPaymentHistoryDoc = paymentHistoryRef.doc();
      const paymentId = newPaymentHistoryDoc.id;

      // Obtener los datos del primer participante
      const { profileId, profileName, selectedPackage } = firstParticipant;

      const deductedAtBooking = selectedPackage.deductedAtBooking;

      if (deductedAtBooking) {
        // Restar 1 crédito del currentCredit del memberForm
        firstParticipant.currentCredit--;

        // Actualizar el currentCredit en el perfil de la persona
        const profileRef = db.collection('profiles').doc(profileId);
        await profileRef.update({
          currentCredit: admin.firestore.FieldValue.increment(-1),
        });
      }

      // Crear un documento en la colección paymentHistory con el paymentAmount y los datos del primer participante
      const paymentHistoryData = {
        sessionId: documentName,
        paymentId: paymentId,
        unknownParticipants: body.unknownParticipants,
        memberType: body.memberType,
        roomNumber: body.roomNumber,
        eventDate: body.eventDate,
        gymId: body.gymId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentStartTime: req.body.endTime,
        paymentEndTime: req.body.startTime,
        paymentType: 'Court',
        paymentAmount: body.feeValue,
        paymentCourtId: body.selectCourt,
        // Agregar los datos del primer participante
        profileId: profileId,
        profileName: profileName,
        // ... (otros datos relacionados con el pago o historial)
      };
      await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);
    }
    if (feeIsActive && memberType === 'guest') {
      const paymentHistoryRef = db.collection('paymentHistory');
      const newPaymentHistoryDoc = paymentHistoryRef.doc();
      const paymentId = newPaymentHistoryDoc.id;
      // Crear un documento en la colección paymentHistory con el paymentAmount
      const paymentHistoryData = {
        sessionId: documentName,
        paymentId: paymentId,
        participants: body?.participants,
        memberType: body.memberType,
        roomNumber: body?.roomNumber,
        eventDate: body.eventDate,
        gymId: body.gymId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentStartTime: req.body.endTime,
        paymentEndTime: req.body.startTime,
        paymentType: 'Court',
        paymentAmount: body.feeValue,
        paymentCourtId: body.selectCourt, // Establecer el paymentAmount obtenido del membership
        // ... (otros datos relacionados con el pago o historial)
      };

      await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);
    }

    res.status(201).json({
      message: 'Session created',
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
async function generateSequentialSessionNumber(gymId) {
  try {
    const metadataRef = db.collection('gyms').doc(gymId);
    const metadataDoc = await metadataRef.get();

    // Obtén el valor actual de gymCourts o inicialízalo en 0 si no existe
    let gymSessions = metadataDoc.exists ? metadataDoc.data().gymSessions : 0;

    // Incrementa el valor de gymCourts
    gymSessions++;

    // Actualiza el número de secuencia en "metadata"
    await metadataRef.set({ gymSessions }, { merge: true });

    // Devuelve el número secuencial formateado
    return gymSessions;
  } catch (error) {
    console.error('Error generating sequential number:', error);
    throw error; // Puedes manejar el error según tus necesidades
  }
}

const getallSession = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    const getClassesCollection = db.collection('sessionHistory');

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

    const sessionsArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const membership = {
        id: doc.id,
        sessionId: data.sessionId,
        endTime: data.endTime,
        eventDate: data.eventDate, // Si descriptions no está definido, usar un array vacío
        feeValue: data.feeValue, // Si gymId no está definido, usar una cadena vacía
        gymId: data?.gymId,
        memberType: data?.memberType,
        participants: data?.participants,
        repeatDaily: data.repeatDaily,
        roomNumber: data.roomNumber, // Si planName no está definido, usar una cadena vacía
        selectCourt: data.selectCourt,
        startTime: data.startTime,
        eventColor: data.eventColor,
        createDate: data.createDate,
        courtName: data.courtName,
        unknownParticipants: data?.unknownParticipants,
        sessionId: data?.sessionId,
      };
      sessionsArray.push(membership);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(sessionsArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

// const updateSession = async (req, res) => {
//   try {
//     const { sessionId, formData } = req.body;
//     const profileRef = db.collection('sessionHistory').doc(sessionId);

//     // Actualiza el documento con los datos proporcionados en formData
//     await profileRef.update(formData);

//     res.json({ message: 'Profile record updated successfully' });
//   } catch (error) {
//     res.status(400).send(error.message);
//   }
// };

const updateSession = async (req, res) => {
  try {
    const { sessionId, formData } = req.body;
    const profileRef = db.collection('sessionHistory').doc(sessionId);

    // Validar los datos recibidos en formData
    if (!formData || !formData.startTime || !formData.endTime) {
      return res.status(400).json({ error: 'Invalid formData provided' });
    }

    const courtSelected = db.collection('courts').doc(formData.selectCourt);
    const courtSnapshot = await courtSelected.get();
    const courtName = courtSnapshot.get('courtName');

    const gymId = courtSnapshot.get('gymId');
    formData.courtName = courtName;

    const maxBookingPerDay = courtSnapshot.get('maxBookingPerDay');
    const maxBookingPerWeek = courtSnapshot.get('maxBookingPerWeek');
    const feeIsActive = courtSnapshot.get('bookingFee');
    const eventDate = new Date(formData.eventDate).toISOString().split('T')[0];

    // Validar límites diarios y semanales de reservas

    const timeToMinutes = (time) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    // Validar superposiciones de horarios
    const overlappingSessions = await db
      .collection('sessionHistory')
      .where('gymId', '==', gymId)
      .where('createDate', '==', eventDate)
      .where('selectCourt', '==', formData.selectCourt)
      .get();

    const conflict = overlappingSessions.docs.some((doc) => {
      const existingStartTime = doc.data().startTime;
      const existingEndTime = doc.data().endTime;

      const existingStartMinutes = timeToMinutes(existingStartTime);
      const existingEndMinutes = timeToMinutes(existingEndTime);
      const bodyStartMinutes = timeToMinutes(formData.startTime);
      const bodyEndMinutes = timeToMinutes(formData.endTime);

      return (
        (bodyStartMinutes < existingStartMinutes &&
          bodyEndMinutes > existingStartMinutes &&
          bodyEndMinutes <= existingEndMinutes) ||
        (bodyStartMinutes >= existingStartMinutes &&
          bodyStartMinutes < existingEndMinutes &&
          bodyEndMinutes <= existingEndMinutes) ||
        (bodyStartMinutes >= existingStartMinutes &&
          bodyStartMinutes < existingEndMinutes &&
          bodyEndMinutes > existingEndMinutes) ||
        (bodyStartMinutes < existingStartMinutes &&
          bodyEndMinutes > existingEndMinutes)
      );
    });

    if (conflict) {
      return res.status(400).json({
        error:
          'There is already a scheduled session with overlapping schedules on this day for the same court',
      });
    }

    // Actualizar el documento en la colección "sessionHistory"
    await profileRef.update(formData);

    // Resto del código...

    res.json({ message: 'Profile record updated successfully' });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

const deleteSession = async (req, res) => {
  try {
    const sessionId = req.params.id;

    const db = admin.firestore();
    const classRef = db.collection('sessionHistory').doc(sessionId);

    const sessionDoc = await classRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    const gymId = sessionData.gymId;

    // Elimina la membresía de la colección "memberships"
    await classRef.delete();

    if (gymId) {
      // Si la membresía está asociada a un gimnasio, también elimínala de la colección "memberships" del gimnasio

      // Actualiza el número secuencial en "metadata" del gimnasio si corresponde
      const metadataRef = db.collection('gyms').doc(gymId);
      const metadataDoc = await metadataRef.get();

      if (metadataDoc.exists) {
        const data = metadataDoc.data();
        const gymClasses = data.gymSessions - 1;

        await metadataRef.update({ gymClasses });
      }
    }

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getTodaysCourts = async (req, res) => {
  try {
    const gymId = req.params.gymId;
    const cardNumber = req.query.cardNumber;

    const today = new Date().toISOString().slice(0, 10);

    const querySnapshot = await db
      .collection('sessionHistory')
      .where('gymId', '==', gymId)
      .where('memberType', '==', 'unknownmember')
      .where('eventDate', '>=', `${today}T00:00:00.000Z`)
      .where('eventDate', '<=', `${today}T23:59:59.999Z`)
      .get();

    const todaysClasses = [];
    querySnapshot.forEach((doc) => {
      const classData = doc.data();
      if (
        classData.unknownParticipants &&
        classData.unknownParticipants.length > 0 &&
        classData.unknownParticipants[0].cardSerialNumber === cardNumber
      ) {
        todaysClasses.push(classData);
      }
    });

    res.status(200).json(todaysClasses);
  } catch (error) {
    console.error('Error al obtener las clases del día de hoy:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener las clases del día de hoy' });
  }
};

module.exports = {
  createCourt,
  getAllCourts,
  updateCourt,
  deleteCourt,
  createSession,
  getallSession,
  updateSession,
  deleteSession,
  getTodaysCourts,
};
