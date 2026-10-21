const express = require('express');
const app = express();
const { db } = require('../firebase');
const {
  registerCreditUsage,
  applyCreditPenalty,
} = require('../utils/credits');
const {
  toPolicy,
  getClassStartLocal,
  nextWindowCount,
  isLateCancellation,
  evaluateLateCancellation,
  evaluateNoShow,
  describeCancellationPolicy,
} = require('../utils/classPenalties');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const moment = require('moment');
const { format } = require('date-fns');
const { logUserActivity } = require('../utils/logUserActivity');
const { logUserPenalty } = require('../utils/logUserPenalty');

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getUserPenalties = async (req, res) => {
  try {
    const { profileId } = req.params;
    // ?includeRecent=true: ademas de las activas, las ya cobradas o pagadas de
    // los ultimos 30 dias. Una penalizacion de creditos que se cobra entera del
    // saldo nace inactiva, y sin esto no se veia en ningun sitio.
    const includeRecent = req.query.includeRecent === 'true';

    const penaltiesRef = db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties');

    let penaltyDocs;
    if (includeRecent) {
      const cutoff = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ).toISOString();
      const snapshot = await penaltiesRef.get();
      penaltyDocs = snapshot.docs
        .filter(
          (doc) =>
            doc.data().status === 'active' ||
            String(doc.data().timestamp || '') >= cutoff
        )
        .sort((a, b) =>
          String(b.data().timestamp || '').localeCompare(
            String(a.data().timestamp || '')
          )
        );
    } else {
      // Filtrar solo los penalties con status "active"
      const snapshot = await penaltiesRef.where('status', '==', 'active').get();
      penaltyDocs = snapshot.docs;
    }

    if (penaltyDocs.length === 0) {
      return res.status(404).json({ message: 'No active penalties found' });
    }

    // Extraer los datos de las penalizaciones
    const activePenalties = penaltyDocs.map((doc) => {
      const data = doc.data();
      const timestamp = data.timestamp;

      // Extraer la fecha y la hora
      const date = timestamp.split('T')[0]; // '2024-09-24'
      const time = timestamp.split('T')[1].split('.')[0]; // '13:35:53'
      const formattedTime = `${parseInt(time.split(':')[0]) % 12 || 12}:${
        time.split(':')[1]
      } ${time.split(':')[0] >= 12 ? 'PM' : 'AM'}`; // Formato 12 horas

      return {
        id: doc.id,
        ...data,
        timestamp: `${date}, ${formattedTime}`, // Formato deseado
      };
    });

    return res.status(200).json(activePenalties);
  } catch (error) {
    console.error('Error fetching user penalties:', error);
    return res
      .status(500)
      .json({ message: 'Error fetching user penalties', error });
  }
};

const addClassUnknownParticipants = async (req, res) => {
  try {
    const classId = req.body.classId;
    const profileId = req.body.profileId;

    // Obtener el perfil del miembro
    const profileSnapshot = await db
      .collection('profiles')
      .where('profileId', '==', profileId)
      .get();

    if (profileSnapshot.empty) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const profileDoc = profileSnapshot.docs[0].data();

    const penaltiesSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties')
      .where('status', '==', 'active')
      .get();

    if (!penaltiesSnapshot.empty) {
      return res.status(403).json({
        message:
          'You cannot book this class due to an active penalty. Please contact reception.',
      });
    }

    const {
      unknownMemberEmail,
      unknownMemberPhoneNumber,
      profileName,
      profilePicture,
      selectedPackage,
      cardSerialNumber,
      currentCredit,
      selectedPackage: { deductedAtBooking },
    } = profileDoc;

    // Tope en <= 0, no en === 0: un saldo ya negativo tampoco puede consumir
    if (currentCredit <= 0) {
      return res.status(400).json({
        message: 'You do not have available credit',
      });
    }

    // Comprobacion y descuento en una transaccion, idempotente por clase
    const bookingUsage = await registerCreditUsage({
      profileId,
      activityId: classId,
      reason: 'booking',
      gymId: profileDoc.gymId,
      shouldDebit: deductedAtBooking === true,
    });

    if (bookingUsage.status === 'no-credit') {
      return res.status(400).json({
        message: 'You do not have available credit',
      });
    }

    const participant = {
      profileId: profileId,
      profileEmail: unknownMemberEmail,
      profileTelephoneNumber: unknownMemberPhoneNumber,
      profileName: profileName,
      profilePicture: profilePicture,
      selectedPackage: selectedPackage,
      cardSerialNumber: cardSerialNumber,
      attendance: false,
    };

    // Obtener referencia a la colección de clases
    const classesCollection = db.collection('classes');
    const classDocRef = classesCollection.doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();

    const classData = classDoc.data();

    // Validar que classCapacity no sea 0
    if (classData.unknownClassCapacity === 0) {
      return res.status(400).json({
        message: 'No slots available for this class',
      });
    }

    // Si la clase no existe, crear un nuevo documento con el contador de participantes inicializado en 1
    if (!classDoc.exists) {
      await classDocRef.set({
        currentUnknownClassParticipants: 1,
      });
    }

    // Obtener referencia a la subcolección de participantes desconocidos
    const unknownParticipantsCollectionRef = classDocRef.collection(
      'unknownParticipants'
    );

    // Verificar si el participante ya está en la subcolección
    const participantDocRef = unknownParticipantsCollectionRef.doc(profileId);
    const participantDoc = await participantDocRef.get();

    if (participantDoc.exists) {
      return res
        .status(400)
        .json({ message: 'You are already a participant in this class' });
    }

    // Añadir el participante a la subcolección
    await participantDocRef.set(participant);

    // Obtener el número actualizado de participantes desconocidos
    const updatedParticipantsSnapshot =
      await unknownParticipantsCollectionRef.get();
    const currentUnknownClassParticipants = updatedParticipantsSnapshot.size;

    // Actualizar el número de participantes en el documento de la clase
    await classDocRef.update({
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });

    return res.status(200).json({
      message: 'Successfully added to the class.',
      currentUnknownClassParticipants: currentUnknownClassParticipants,
    });
  } catch (error) {
    console.error('Error al agregar participantes:', error);
    return res
      .status(500)
      .json({ message: 'Error interno del servidor al agregar participantes' });
  }
};

const addClassParticipants = async (req, res) => {
  try {
    const classId = req.body.classId;
    const profileId = req.body.profileId;

    // Obtener el perfil del usuario
    const profileSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .get();

    if (!profileSnapshot.exists) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const profileDoc = profileSnapshot.data();

    // Verificar si el perfil está congelado o tiene el estado en 'false'
    if (
      profileDoc.profileFrozen === true ||
      profileDoc.profileStatus === 'false'
    ) {
      return res.status(403).json({
        message:
          'You cannot book this class because your profile is frozen or your membership Expired.',
      });
    }

    const penaltiesSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties')
      .where('status', '==', 'active')
      .get();

    if (!penaltiesSnapshot.empty) {
      return res.status(403).json({
        message:
          'You cannot book this class due to an active penalty. Please contact reception.',
      });
    }

    // Generar el código QR para el participante
    const qrData = `${profileDoc.profileId},${classId}`;
    const qrCode = await generateQRCode(qrData);

    const participant = {
      profileId: profileDoc.profileId,
      profileEmail: profileDoc.profileEmail,
      profileTelephoneNumber: profileDoc.profileTelephoneNumber,
      profileName: profileDoc.profileName,
      profilePicture: profileDoc.profilePicture,
      cardSerialNumber: profileDoc.cardSerialNumber,
      attendance: false,
      qrCode: qrCode, // Añadir el código QR al participante
    };

    // Obtener la referencia a la colección de clases
    const classDocRef = db.collection('classes').doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();

    const classData = classDoc.data();

    // Validar que classCapacity no sea 0
    if (classData.classCapacity === 0) {
      return res.status(400).json({
        message: 'No slots available for this class',
      });
    }

    if (!classDoc.exists) {
      // Si la clase no existe, crear un nuevo documento y la subcolección de participantes
      await classDocRef.set({
        currentClassParticipants: 1,
      });

      // Crear la subcolección de participantes y añadir el participante
      await classDocRef
        .collection('participants')
        .doc(profileId)
        .set(participant);

      return res.status(200).json({
        message: 'Participant added successfully',
        currentClassParticipants: 1,
      });
    }

    // Verificar si el participante ya está en la subcolección
    const participantDocRef = classDocRef
      .collection('participants')
      .doc(profileId);
    const participantDoc = await participantDocRef.get();

    if (participantDoc.exists) {
      return res
        .status(400)
        .json({ message: 'You are already a participant in this class' });
    }

    // Añadir el participante a la subcolección y actualizar el conteo
    const batch = db.batch();
    batch.set(participantDocRef, participant);

    // Actualizar el número de participantes en el documento de la clase
    const currentClassParticipantsSnapshot = await classDocRef
      .collection('participants')
      .get();
    const currentClassParticipants = currentClassParticipantsSnapshot.size + 1;

    batch.update(classDocRef, {
      currentClassParticipants: currentClassParticipants,
    });

    await batch.commit();

    return res.status(200).json({
      message: 'Successfully added to the class.',
      currentClassParticipants: currentClassParticipants,
    });
  } catch (error) {
    console.error('Error adding participant:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error while adding participant' });
  }
};

// const addClassParticipants = async (req, res) => {
//   try {
//     const classId = req.body.classId;
//     const profileId = req.body.profileId;

//     // Obtener el perfil del usuario
//     const profileSnapshot = await db
//       .collection('profiles')
//       .doc(profileId)
//       .get();

//     if (!profileSnapshot.exists) {
//       return res.status(404).json({ message: 'Profile not found' });
//     }
//     const profileDoc = profileSnapshot.data();

//     const penaltiesSnapshot = await db
//       .collection('profiles')
//       .doc(profileId)
//       .collection('userPenalties')
//       .where('status', '==', 'active')
//       .get();

//     if (!penaltiesSnapshot.empty) {
//       return res.status(403).json({
//         message:
//           'You cannot book this class due to an active penalty. Please contact reception.',
//       });
//     }

//     // Generar el código QR para el participante
//     const qrData = `${profileDoc.profileId},${classId}`;
//     const qrCode = await generateQRCode(qrData);

//     const participant = {
//       profileId: profileDoc.profileId,
//       profileEmail: profileDoc.profileEmail,
//       profileTelephoneNumber: profileDoc.profileTelephoneNumber,
//       profileName: profileDoc.profileName,
//       profilePicture: profileDoc.profilePicture,
//       cardSerialNumber: profileDoc.cardSerialNumber,
//       attendance: false,
//       qrCode: qrCode, // Añadir el código QR al participante
//     };

//     // Obtener la referencia a la colección de clases
//     const classDocRef = db.collection('classes').doc(classId);

//     // Verificar si la clase existe
//     const classDoc = await classDocRef.get();

//     const classData = classDoc.data();

//     // Validar que classCapacity no sea 0
//     if (classData.classCapacity === 0) {
//       return res.status(400).json({
//         message: 'No slots available for this class',
//       });
//     }

//     if (!classDoc.exists) {
//       // Si la clase no existe, crear un nuevo documento y la subcolección de participantes
//       await classDocRef.set({
//         currentClassParticipants: 1,
//       });

//       // Crear la subcolección de participantes y añadir el participante
//       await classDocRef
//         .collection('participants')
//         .doc(profileId)
//         .set(participant);

//       return res.status(200).json({
//         message: 'Participant added successfully',
//         currentClassParticipants: 1,
//       });
//     }

//     // Verificar si el participante ya está en la subcolección
//     const participantDocRef = classDocRef
//       .collection('participants')
//       .doc(profileId);
//     const participantDoc = await participantDocRef.get();

//     if (participantDoc.exists) {
//       return res
//         .status(400)
//         .json({ message: 'You are already a participant in this class' });
//     }

//     // Añadir el participante a la subcolección y actualizar el conteo
//     const batch = db.batch();
//     batch.set(participantDocRef, participant);

//     // Actualizar el número de participantes en el documento de la clase
//     const currentClassParticipantsSnapshot = await classDocRef
//       .collection('participants')
//       .get();
//     const currentClassParticipants = currentClassParticipantsSnapshot.size + 1;

//     batch.update(classDocRef, {
//       currentClassParticipants: currentClassParticipants,
//     });

//     await batch.commit();

//     return res.status(200).json({
//       message: 'Successfully added to the class.',
//       currentClassParticipants: currentClassParticipants,
//     });
//   } catch (error) {
//     console.error('Error adding participant:', error);
//     return res
//       .status(500)
//       .json({ message: 'Internal server error while adding participant' });
//   }
// };

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

const getUnknownMemberClassesByProfileId = async (req, res) => {
  try {
    const { gymId, profileId } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Establecer a medianoche
    const todayISOString = today.toISOString();

    const classesRef = db.collection('classes');
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', todayISOString)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ message: 'No classes found for the specified criteria.' });
    }

    const classes = [];
    // Iterar sobre cada documento de clase
    for (const doc of snapshot.docs) {
      const classId = doc.id;
      const classDoc = doc.data();

      // Obtener la subcolección de unknownParticipants
      const unknownParticipantsCollectionRef = db
        .collection('classes')
        .doc(classId)
        .collection('unknownParticipants');
      const participantSnapshot = await unknownParticipantsCollectionRef
        .where('profileId', '==', profileId)
        .get();

      if (!participantSnapshot.empty) {
        // Si se encuentra el perfil en la subcolección, añadir la clase a la lista
        classes.push(classDoc);
      }
    }

    // Politica de cancelacion de cada clase, para que la PWA diga al no miembro
    // si cancelar le costara creditos antes de que confirme
    const primaryClassIds = [
      ...new Set(classes.map((c) => c.primaryClassId).filter(Boolean)),
    ];
    const [gymTimeZone, profileDoc, primaryClassDocs] = await Promise.all([
      getGymTimeZone(gymId),
      db.collection('profiles').doc(profileId).get(),
      Promise.all(
        primaryClassIds.map((id) =>
          db.collection('primaryClasses').doc(id).get()
        )
      ),
    ]);
    const restrictionsByPrimaryClass = {};
    primaryClassDocs.forEach((doc) => {
      if (doc.exists) {
        restrictionsByPrimaryClass[doc.id] =
          doc.data().nonMemberRestrictions || {};
      }
    });

    const classesWithPolicy = classes.map((classItem) => ({
      ...classItem,
      cancellationPolicy: describeCancellationPolicy({
        restrictions: restrictionsByPrimaryClass[classItem.primaryClassId],
        classData: classItem,
        gymTimeZone,
        profileData: profileDoc.exists ? profileDoc.data() : {},
      }),
    }));

    return res.status(200).json(classesWithPolicy);
  } catch (error) {
    console.error(`Error getting classes: ${error}`);
    return res.status(500).json({ message: 'Error getting classes', error });
  }
};

const getmemberClassesByProfileId = async (req, res) => {
  try {
    const { gymId, profileId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Establecer a medianoche
    const todayISOString = today.toISOString();

    // Obtener referencia a la colección de clases
    const classesRef = db.collection('classes');
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', todayISOString)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ message: 'No classes found for the specified criteria.' });
    }

    const classes = [];

    // Iterar sobre cada clase para verificar participantes
    for (const classDoc of snapshot.docs) {
      const classData = classDoc.data();
      const classId = classDoc.id;

      // Obtener la subcolección de participantes
      const participantsCollectionRef = db
        .collection('classes')
        .doc(classId)
        .collection('participants');

      // Obtener la subcolección de waitingList
      const waitingListCollectionRef = db
        .collection('classes')
        .doc(classId)
        .collection('waitingList');

      // Verificar si el profileId está en la subcolección de participantes
      const participantSnapshot = await participantsCollectionRef
        .doc(profileId)
        .get();

      // Verificar si el profileId está en la subcolección de waitingList
      const waitingListSnapshot = await waitingListCollectionRef
        .doc(profileId)
        .get();

      if (participantSnapshot.exists) {
        // Obtener todos los participantes para esta clase
        const participantsSnapshot = await participantsCollectionRef.get();
        const participants = participantsSnapshot.docs.map((doc) => doc.data());

        // Añadir los datos de la clase junto con los participantes y bookingStatus
        classes.push({
          ...classData,
          participants: participants,
          bookingStatus: "confirmed"
        });
      } else if (waitingListSnapshot.exists) {
        // Añadir los datos de la clase con bookingStatus en waitingList y sin participantes
        classes.push({
          ...classData,
          bookingStatus: "waiting"
        });
      }
    }

    return res.status(200).json(classes);
  } catch (error) {
    console.error(`Error getting classes: ${error}`);
    return res.status(500).json({ message: 'Error getting classes', error });
  }
};

const getUnknownMemberCourtsByProfileId = async (req, res) => {
  try {
    const { gymId, profileId } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Establecer a medianoche
    const todayISOString = today.toISOString();

    const classesRef = db.collection('sessionHistory');
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', todayISOString)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ message: 'No courts found for the specified criteria.' });
    }

    const courts = [];
    snapshot.forEach((doc) => {
      const courtData = doc.data();

      // Verificar si el profileId está en el array de unknownParticipants, si existe
      if (
        courtData.unknownParticipants &&
        courtData.unknownParticipants.some(
          (participant) => participant.profileId === profileId
        )
      ) {
        courts.push(courtData);
      }
    });

    return res.status(200).json(courts);
  } catch (error) {
    console.error(`Error getting courts: ${error}`);
    return res.status(500).json({ message: 'Error getting courts', error });
  }
};

const getmemberCourtsByProfileId = async (req, res) => {
  try {
    const { gymId, profileId } = req.body;

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Establecer a medianoche
    const todayISOString = today.toISOString();

    const classesRef = db.collection('sessionHistory');
    const snapshot = await classesRef
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', todayISOString)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ message: 'No courts found for the specified criteria.' });
    }

    const courts = [];
    snapshot.forEach((doc) => {
      const courtData = doc.data();
      // Verificar si el profileId está en el array de unknownParticipants, si existe
      if (
        courtData.participants &&
        courtData.participants.some(
          (participant) => participant.profileId === profileId
        )
      ) {
        courts.push(courtData);
      }
    });

    return res.status(200).json(courts);
  } catch (error) {
    console.error(`Error getting courts: ${error}`);
    return res.status(500).json({ message: 'Error getting courts', error });
  }
};

const cancelMemberClass = async (req, res) => {
  const { gymId, profileId, classId, role } = req.body;

  try {
    // Referencia a la clase
    const classRef = db.collection('classes').doc(classId);
    const classDoc = await classRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const classData = classDoc.data();
    const batch = db.batch();

    let participantsCollectionRef;
    let waitingListCollectionRef;
    let participantsCounterField;
    let waitingListCounterField = null; // Inicialmente null, se define si es necesario

    if (role === 'member') {
      // Flujo para miembros (sin cambios)
      participantsCollectionRef = classRef.collection('participants');
      waitingListCollectionRef = classRef.collection('waitingList');
      participantsCounterField = 'currentClassParticipants';
      waitingListCounterField = 'currentWaitingListCount'; // Definir el campo si es miembro
    } else if (role === 'unknownMember') {
      // Flujo para unknownMembers con validaciones
      participantsCollectionRef = classRef.collection('unknownParticipants');
      waitingListCollectionRef = classRef.collection('unknownWaitingList');
      participantsCounterField = 'currentUnknownClassParticipants';
      // No necesitamos actualizar el contador de la lista de espera para unknownMember
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Verificar si el profileId está en participants
    const participantQuery = await participantsCollectionRef
      .where('profileId', '==', profileId)
      .get();

    // Verificar si el profileId está en waitingList
    const waitingListQuery = await waitingListCollectionRef
      .where('profileId', '==', profileId)
      .get();

    if (participantQuery.empty && waitingListQuery.empty) {
      return res.status(404).json({ error: 'Member not found in class or waiting list' });
    }

    // Si el miembro está en la waitingList, removerlo sin penalidad alguna
    if (participantQuery.empty && !waitingListQuery.empty) {
      const waitingBatch = db.batch();
      waitingListQuery.forEach((doc) => {
        waitingBatch.delete(doc.ref);
      });
      await waitingBatch.commit();

      // Actualizar el contador de la lista de espera si aplica
      if (waitingListCounterField) {
        const updatedWaitingListSnapshot = await waitingListCollectionRef.get();
        const currentWaitingListCount = updatedWaitingListSnapshot.size;
        await classRef.update({
          [waitingListCounterField]: currentWaitingListCount,
        });
      }

      return res.status(200).json({
        message: 'Member removed from waiting list successfully. No penalty applied.',
      });
    }

    // El miembro está en participants, continuar con el flujo normal
    participantQuery.forEach((doc) => {
      batch.delete(doc.ref);
    });

    let primaryClassData = null;

    if (classData.primaryClassId) {
      const primaryClassRef = db
        .collection('primaryClasses')
        .doc(classData.primaryClassId);
      const primaryClassDoc = await primaryClassRef.get();

      if (!primaryClassDoc.exists) {
        return res.status(404).json({ error: 'Primary class not found' });
      }

      primaryClassData = primaryClassDoc.data(); // Asignamos la información de la clase primaria a la variable
    }

    // Penalizacion por cancelacion tardia segun lo que el manager configuro en
    // la clase primaria para cada tipo de socio (ver utils/classPenalties)
    const profileFound = await handleClassCancellation({
      audience: role === 'member' ? 'member' : 'nonMember',
      profileId,
      gymId,
      classId,
      classData,
      restrictions:
        role === 'member'
          ? primaryClassData?.memberRestrictions
          : primaryClassData?.nonMemberRestrictions,
    });

    if (!profileFound) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Procesar la lista de espera
    if (role === 'member') {
      // Flujo para miembros (sin cambios)
      const waitingListSnapshot = await waitingListCollectionRef
        .orderBy('position') // Ordenar por 'position' en lugar de 'addedAt'
        .limit(1)
        .get();

      let nextWaitingMember = null;

      if (!waitingListSnapshot.empty) {
        const nextWaitingMemberDoc = waitingListSnapshot.docs[0];
        nextWaitingMember = nextWaitingMemberDoc.data();

        // Generar el código QR para el nuevo participante
        const qrData = `${nextWaitingMember.profileId},${classId}`;
        const qrCode = await generateQRCode(qrData);

        // Crear el nuevo participante con el QR
        const newParticipant = {
          ...nextWaitingMember,
          qrCode: qrCode,
          attendance: false,
        };

        // Mover al miembro de la lista de espera a la clase
        const newParticipantRef = participantsCollectionRef.doc(
          nextWaitingMember.profileId
        );
        batch.set(newParticipantRef, newParticipant);
        batch.delete(nextWaitingMemberDoc.ref);

        // Actualizar el contador de la lista de espera
        if (waitingListCounterField) {
          const updatedWaitingListSnapshot =
            await waitingListCollectionRef.get();
          const currentWaitingListCount = updatedWaitingListSnapshot.size - 1;

          await classRef.update({
            [waitingListCounterField]: currentWaitingListCount,
          });
        }

        // Enviar notificación por correo electrónico
        await sendNotificationEmail(
          nextWaitingMember.profileEmail,
          nextWaitingMember.profileName,
          classData.className,
          classData.eventDate,
          classData.startTime,
          classData.endTime
        );
      } else {
        // Si no hay miembros en la lista de espera, simplemente decrementa el contador de la clase
        const currentClassParticipantsSnapshot =
          await participantsCollectionRef.get();
        const currentClassParticipants = currentClassParticipantsSnapshot.size;

        if (currentClassParticipants > 0) {
          await classRef.update({
            [participantsCounterField]: currentClassParticipants - 1,
          });
        }
      }
    } else if (role === 'unknownMember') {
      // Flujo para unknownMembers con validaciones
      const processWaitingListForUnknownMember = async () => {
        let waitingListSnapshot = await waitingListCollectionRef
          .orderBy('position') // Ordenar por 'position'
          .get(); // Obtener toda la lista de espera para iterar si es necesario

        // Bandera para verificar si encontramos un miembro con crédito
        let memberWithCreditFound = false;

        // Recorrer toda la lista de espera
        for (const nextWaitingMemberDoc of waitingListSnapshot.docs) {
          const nextWaitingMember = nextWaitingMemberDoc.data();
          const nextProfileId = nextWaitingMember.profileId;

          // Verificar el crédito del perfil en la lista de espera
          const profileDoc = await db
            .collection('profiles')
            .doc(nextProfileId)
            .get();
          const {
            currentCredit,
            selectedPackage: { deductedAtBooking },
          } = profileDoc.data();

          // Si el crédito es mayor a 0, procesar al siguiente participante
          if (currentCredit > 0) {
            // Generar el código QR para el nuevo participante
            const qrData = `${nextProfileId},${classId}`;
            const qrCode = await generateQRCode(qrData);

            // Crear el nuevo participante con el QR
            const newParticipant = {
              ...nextWaitingMember,
              qrCode: qrCode,
              attendance: false,
            };

            // Mover al miembro de la lista de espera a la clase
            const newParticipantRef =
              participantsCollectionRef.doc(nextProfileId);
            batch.set(newParticipantRef, newParticipant);
            batch.delete(nextWaitingMemberDoc.ref);

            // Verificar si se debe descontar el crédito
            if (deductedAtBooking) {
              await registerCreditUsage({
                profileId: nextProfileId,
                activityId: classId,
                reason: 'booking',
                gymId: gymId,
                shouldDebit: true,
              });
            }

            // Enviar notificación por correo electrónico
            await sendNotificationEmail(
              nextWaitingMember.profileEmail,
              nextWaitingMember.profileName,
              classData.className,
              classData.eventDate,
              classData.startTime,
              classData.endTime
            );

            memberWithCreditFound = true; // Marcar que encontramos a un miembro con crédito
            break; // Salir del ciclo ya que encontramos un miembro con crédito
          } else {
            // Si el miembro no tiene crédito, saltarlo y continuar con el siguiente en la lista
            continue;
          }
        }

        // Si no encontramos ningún miembro con crédito, devolver un mensaje
        if (!memberWithCreditFound) {
          const currentClassParticipantsSnapshot =
            await participantsCollectionRef.get();
          const currentClassParticipants =
            currentClassParticipantsSnapshot.size;

          if (currentClassParticipants > 0) {
            await classRef.update({
              [participantsCounterField]: currentClassParticipants - 1,
            });
          }
        }
      };

      // Procesar la lista de espera para unknownMembers
      await processWaitingListForUnknownMember();
    }

    // Confirmar las operaciones
    await batch.commit();

    return res
      .status(200)
      .json({ message: 'Class canceled and waiting list processed' });
  } catch (error) {
    console.error('Error canceling member class:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getGymTimeZone = async (gymId) => {
  try {
    const gymDoc = await db.collection('gyms').doc(gymId).get();
    if (!gymDoc.exists) {
      throw new Error('Gym not found');
    }
    return gymDoc.data().gymTimeZone;
  } catch (error) {
    console.error('Error fetching gym time zone:', error.message);
    throw error;
  }
};

const getLocalTime = (currentDateTime, gymTimeZone) => {
  const offsetMatch = /UTC([+-]?\d*\.?\d*)/.exec(gymTimeZone);
  if (offsetMatch) {
    const offsetHours = parseFloat(offsetMatch[1]);

    return new Date(currentDateTime.getTime() + offsetHours * 60 * 60 * 1000);
  } else {
    throw new Error('Invalid time zone format.');
  }
};

const cancelMemberCourt = async (req, res) => {
  const { gymId, profileId, courtId, role } = req.body;

  try {
    // Referencia al documento de la cancha
    const courtRef = db.collection('sessionHistory').doc(courtId);

    // Verificar si el documento existe
    const courtDoc = await courtRef.get();

    if (!courtDoc.exists) {
      return res.status(404).json({ error: 'Court not found' });
    }

    // Eliminar el documento de la cancha
    await courtRef.delete();

    return res
      .status(200)
      .json({ message: 'Court session canceled and document deleted' });
  } catch (error) {
    console.error('Error canceling member court:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
const addToMemberWaitingList = async (req, res) => {
  try {
    const classId = req.body.classId;
    const profileId = req.body.profileId;

    // Obtener el perfil del usuario
    const profileSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .get();

    if (!profileSnapshot.exists) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const profileDoc = profileSnapshot.data();

    // Obtener la referencia al documento de la clase
    const classDocRef = db.collection('classes').doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const participantsSnapshot = await classDocRef
      .collection('participants')
      .doc(profileId)
      .get();

    if (participantsSnapshot.exists) {
      return res.status(400).json({
        message: 'You are already enrolled in this class',
      });
    }

    // Obtener la última posición en la lista de espera
    const waitingListSnapshot = await classDocRef
      .collection('waitingList')
      .orderBy('position', 'desc')
      .limit(1)
      .get();
    const nextPosition = waitingListSnapshot.empty
      ? 1
      : waitingListSnapshot.docs[0].data().position + 1;

    // Crear el objeto de espera
    const waitingMember = {
      profileId: profileDoc.profileId,
      profileEmail: profileDoc.profileEmail,
      profileTelephoneNumber: profileDoc.profileTelephoneNumber,
      cardSerialNumber: profileDoc.cardSerialNumber,
      profileName: profileDoc.profileName,
      profileLastname: profileDoc.profileLastname,
      profilePicture: profileDoc.profilePicture,
      addedAt: new Date().toISOString(),
      position: nextPosition, // Añadir la posición en la lista de espera
    };

    // Verificar si el participante ya está en la lista de espera
    const waitingListDocRef = classDocRef
      .collection('waitingList')
      .doc(profileId);
    const waitingListDoc = await waitingListDocRef.get();

    if (waitingListDoc.exists) {
      return res.status(400).json({
        message: 'You are already in the waiting list for this class',
      });
    }

    // Añadir el miembro a la subcolección waitingList
    await waitingListDocRef.set(waitingMember);

    return res
      .status(200)
      .json({ message: 'Successfully added to the waiting list.' });
  } catch (error) {
    console.error('Error adding to waiting list:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error while adding to waiting list' });
  }
};

const addToUnknownMemberWaitingList = async (req, res) => {
  try {
    const classId = req.body.classId;
    const profileId = req.body.profileId;

    // Obtener el perfil del miembro
    const profileSnapshot = await db
      .collection('profiles')
      .where('profileId', '==', profileId)
      .get();

    if (profileSnapshot.empty) {
      return res.status(404).json({ message: 'Profile not found' });
    }

    const profileDoc = profileSnapshot.docs[0].data();
    const {
      unknownMemberEmail,
      unknownMemberPhoneNumber,
      profileName,
      profilePicture,
      selectedPackage,
      cardSerialNumber,
      currentCredit,
      selectedPackage: { deductedAtBooking },
    } = profileDoc;

    // Tope en <= 0, no en === 0
    if (currentCredit <= 0) {
      return res.status(400).json({
        message: 'You do not have available credit',
      });
    }

    // if (deductedAtBooking) {
    //   // Actualizar el currentCredit en el perfil de la persona
    //   const profileRef = db.collection('profiles').doc(profileId);
    //   await profileRef.update({
    //     currentCredit: admin.firestore.FieldValue.increment(-1),
    //   });
    // }

    // Crear el objeto de espera
    const waitingMember = {
      profileId,
      profileEmail: unknownMemberEmail,
      profileTelephoneNumber: unknownMemberPhoneNumber,
      profileName,
      profilePicture,
      selectedPackage,
      cardSerialNumber,
      addedAt: new Date().toISOString(), // Tiempo en que se añadió a la lista de espera
    };

    // Obtener referencia a la colección de clases
    const classDocRef = db.collection('classes').doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();

    if (!classDoc.exists) {
      return res.status(404).json({ message: 'Class not found' });
    }

    const participantsSnapshot = await classDocRef
      .collection('unknownParticipants')
      .doc(profileId)
      .get();

    if (participantsSnapshot.exists) {
      return res.status(400).json({
        message: 'You are already enrolled in this class',
      });
    }

    // Obtener la última posición en la lista de espera
    const waitingListSnapshot = await classDocRef
      .collection('unknownWaitingList')
      .orderBy('position', 'desc')
      .limit(1)
      .get();
    const nextPosition = waitingListSnapshot.empty
      ? 1
      : waitingListSnapshot.docs[0].data().position + 1;

    // Añadir la posición al objeto de espera
    waitingMember.position = nextPosition;

    // Verificar si el participante ya está en la lista de espera
    const waitingListDocRef = classDocRef
      .collection('unknownWaitingList')
      .doc(profileId);
    const waitingListDoc = await waitingListDocRef.get();

    if (waitingListDoc.exists) {
      return res.status(400).json({
        message: 'You are already in the waiting list for this class',
      });
    }

    // Añadir el miembro a la subcolección waitingList
    await waitingListDocRef.set(waitingMember);

    return res.status(200).json({
      message: 'Successfully added to the waiting list.',
    });
  } catch (error) {
    console.error('Error adding to waiting list:', error);
    return res
      .status(500)
      .json({ message: 'Internal server error while adding to waiting list' });
  }
};

const formatDateTime = (eventDate, startTime, endTime) => {
  if (eventDate && startTime && endTime) {
    // Formatea la fecha
    const formattedDate = format(new Date(eventDate), 'EEEE, MMMM d, y');

    // Convierte el tiempo en formato de 24 horas a formato de 12 horas
    const formattedStartTime = format(
      new Date(`1970-01-01T${startTime}:00`),
      'h:mm a'
    );
    const formattedEndTime = format(
      new Date(`1970-01-01T${endTime}:00`),
      'h:mm a'
    );

    return {
      formattedDate,
      formattedStartTime,
      formattedEndTime,
    };
  }
  return {
    formattedDate: '',
    formattedStartTime: '',
    formattedEndTime: '',
  };
};

const generateNotificationEmailTemplate = (
  name,
  className,
  eventDate,
  startTime,
  endTime
) => {
  // Formatear las fechas y horas
  const { formattedDate, formattedStartTime, formattedEndTime } =
    formatDateTime(eventDate, startTime, endTime);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          width: 100%;
          max-width: 600px;
          margin: 20px auto;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .title {
          font-size: 24px;
          font-weight: bold;
          color: #333333;
          text-align: center;
        }
        .text {
          font-size: 16px;
          color: #555555;
          margin-bottom: 20px;
          text-align: center;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th, td {
          padding: 10px;
          text-align: left;
          border-bottom: 1px solid #dddddd;
        }
        th {
          background-color: #f2f2f2;
          color: #333333;
        }
        .footer {
          margin-top: 20px;
          font-size: 14px;
          color: #777777;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">You’ve Been Added to the Class!</div>
        <p class="text">Hi ${name},</p>
        <p class="text">Good news! A spot has opened up in your class. Here are the details:</p>
        <table>
          <tr>
            <th>Class Name</th>
            <td>${className}</td>
          </tr>
          <tr>
            <th>Date</th>
            <td>${formattedDate}</td>
          </tr>
          <tr>
            <th>Start Time</th>
            <td>${formattedStartTime}</td>
          </tr>
          <tr>
            <th>End Time</th>
            <td>${formattedEndTime}</td>
          </tr>
        </table>
        <p class="text">You have been added to the class and are no longer on the waiting list. We look forward seeing you in the class!</p>
        <div class="footer">If you have any questions, feel free to contact us.</div>
      </div>
    </body>
    </html>
  `;
};

const sendNotificationEmail = async (
  email,
  name,
  className,
  eventDate,
  startTime,
  endTime
) => {
  const renderedTemplate = generateNotificationEmailTemplate(
    name,
    className,
    eventDate,
    startTime,
    endTime
  );

  const params = {
    Source: 'NeoApp - Class Notification <no-reply@neoappgym.com>', // Dirección de remitente verificada en SES
    Destination: {
      ToAddresses: [email], // Dirección del destinatario
    },
    Message: {
      Subject: { Data: 'You’ve Been Added to the Class!' }, // Asunto del correo
      Body: {
        Html: {
          Data: renderedTemplate, // Cuerpo del correo en HTML
        },
        Text: {
          Data: `Hi ${name},\n\nGood news! A spot has opened up in your class.\n\nClass Name: ${className}\nDate: ${eventDate}\nStart Time: ${startTime}\nEnd Time: ${endTime}\n\nYou have been added to the class and are no longer on the waiting list.\n\nWe look forward to seeing you in the class!`, // Cuerpo del correo en texto plano
        },
      },
    },
  };

  try {
    // Enviar el correo electrónico
    await sesClient.send(new SendEmailCommand(params));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

const payPenalty = async (req, res) => {
  try {
    const { penaltyId, profileId, gymId } = req.body;

    // 1. Obtener la información del perfil usando profileId
    const profileRef = db.collection('profiles').doc(profileId);
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const profileData = profileDoc.data();
    const membershipId = profileData.membershipId; // Obtener el membershipId del perfil

    // 2. Acceder a la subcolección de penalizaciones
    const penaltiesRef = profileRef.collection('userPenalties');
    const penaltyDoc = await penaltiesRef.doc(penaltyId).get();

    if (!penaltyDoc.exists) {
      return res.status(404).json({ error: 'Penalty not found.' });
    }

    const penaltyData = penaltyDoc.data();
    const paymentAmount = penaltyData.details.amount; // Obtener el monto de la penalización
    const paymentPenaltyReason = penaltyData.details.reason;

    // 3. Registrar el pago en paymentHistory
    const paymentHistoryRef = db.collection('paymentHistory');
    const newPaymentHistoryDoc = paymentHistoryRef.doc();
    const paymentId = newPaymentHistoryDoc.id;
    let paymentHistoryData;

    if (profileData.role.includes('member')) {
      paymentHistoryData = {
        paymentId: paymentId,
        profileId: profileId,
        membershipId: membershipId, // Usar el membershipId obtenido del perfil
        gymId: gymId,
        paymentDate: new Date().toISOString().slice(0, 10),
        timestamp: admin.firestore.Timestamp.now(),
        cardSerialNumber: profileData.cardSerialNumber,
        paymentType: 'Penalty',
        paymentAmount: paymentAmount, // Usar el monto de la penalización
        paymentPenaltyReason: paymentPenaltyReason, // Agregar la razón del pago
        // ... (otros datos relacionados con el pago o historial)
      };
    } else if (profileData.role.includes('unknownMember')) {
      paymentHistoryData = {
        paymentId: paymentId,
        profileId: profileId,
        gymId: gymId,
        memberType: 'unknownMember',
        paymentDate: new Date().toISOString().slice(0, 10),
        timestamp: admin.firestore.Timestamp.now(),
        paymentType: 'Penalty',
        cardSerialNumber: profileData.cardSerialNumber, // Suponiendo que este dato existe en profileData
        paymentPenaltyReason: paymentPenaltyReason,
        paymentPackage: profileData.selectedPackage, // Suponiendo que este dato existe en profileData
        paymentAmount: paymentAmount, // Establecer el paymentAmount obtenido del membership
        // ... (otros datos relacionados con el pago o historial)
      };
    }

    await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

    // 4. Actualizar el estado de la penalización a 'inactive'
    await penaltiesRef.doc(penaltyId).update({ status: 'inactive' });

    // 5. Verificar si hay otras penalizaciones activas
    const activePenaltiesSnapshot = await penaltiesRef
      .where('status', '==', 'active')
      .get();

    const hasActivePenalties = !activePenaltiesSnapshot.empty;

    // 6. Actualizar el campo penaltyActive en el perfil si no hay más penalizaciones activas
    await profileRef.update({ penaltyActive: hasActivePenalties });

    return res.status(200).json({
      message: 'Penalty paid and status updated to inactive successfully.',
    });
  } catch (error) {
    console.error(`Error processing penalty payment: ${error.message}`);
    return res
      .status(500)
      .json({ error: 'Failed to process penalty payment.' });
  }
};

const updatePenaltyStatus = async (req, res) => {
  const { penaltyId, status, profileId } = req.body;

  try {
    // Obtener referencia a la penalización
    const penaltyRef = db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties')
      .doc(penaltyId);

    // Verificar si la penalización existe
    const penaltyDoc = await penaltyRef.get();
    if (!penaltyDoc.exists) {
      return res.status(404).json({ message: 'Penalty not found' });
    }

    // Actualizar el estado de la penalización
    await penaltyRef.update({ status: status });

    // Comprobar si quedan penalizaciones activas
    const penaltiesSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties')
      .where('status', '==', 'active') // Suponiendo que 'active' es el estado para penalizaciones activas
      .get();

    const hasActivePenalties = !penaltiesSnapshot.empty;

    // Actualizar el campo penaltyActive en el perfil si no quedan penalizaciones activas
    const profileRef = db.collection('profiles').doc(profileId);
    await profileRef.update({ penaltyActive: hasActivePenalties });

    return res
      .status(200)
      .json({ message: 'Penalty status updated successfully' });
  } catch (error) {
    console.error('Error updating penalty status:', error);
    return res
      .status(500)
      .json({ message: 'Error updating penalty status', error });
  }
};

const penalizeNoShows = async (gymId) => {
  try {
    // Obtener la zona horaria del gimnasio
    const gymTimeZone = await getGymTimeZone(gymId);
    // Obtener la hora local actual
    const localNow = getLocalTime(new Date(), gymTimeZone);

    // Calcular la fecha del día anterior
    const yesterday = new Date(localNow);
    yesterday.setDate(yesterday.getDate() - 1);

    // Formatear la fecha de ayer para la consulta
    const formattedYesterday = yesterday.toISOString().split('T')[0]; // "2024-10-01"

    // Filtrar las clases del día anterior en la colección de clases
    const classesSnapshot = await admin
      .firestore()
      .collection('classes')
      .where('gymId', '==', gymId)
      .where('eventDate', '>=', formattedYesterday + 'T00:00:00Z')
      .where('eventDate', '<', formattedYesterday + 'T23:59:59Z')
      .get();

    for (const gymClass of classesSnapshot.docs) {
      const primaryClassId = gymClass.data().primaryClassId;
      const classId = gymClass.data().classId;
      // Obtener las restricciones de la clase primaria
      const primaryClassSnapshot = await admin
        .firestore()
        .collection('primaryClasses')
        .doc(primaryClassId)
        .get();

      const primaryClass = primaryClassSnapshot.data();
      const memberRestrictions =
        primaryClass.memberRestrictions?.restrictions || false;
      const nonMemberRestrictions =
        primaryClass.nonMemberRestrictions?.restrictions || false;

      // Verificar si hay restricciones activas (para miembros o no miembros)
      if (memberRestrictions || nonMemberRestrictions) {
        // Filtrar participantes que no asistieron (attendance: false)
        const participantsSnapshot = await admin
          .firestore()
          .collection('classes')
          .doc(classId)
          .collection('participants')
          .where('attendance', '==', false)
          .get();

        // Penalizar a cada participante miembro
        for (const participant of participantsSnapshot.docs) {
          await applyMemberPenalty(participant.id, primaryClass);
        }

        // Filtrar participantes no miembros
        const unknownParticipantsSnapshot = await admin
          .firestore()
          .collection('classes')
          .doc(classId)
          .collection('unknownParticipants')
          .where('attendance', '==', false)
          .get();

        // Penalizar a cada participante no miembro
        for (const unknownParticipant of unknownParticipantsSnapshot.docs) {
          await applyNonMemberPenalty(unknownParticipant.id, primaryClass);
        }
      }
    }
  } catch (error) {
    console.error('Error al penalizar no shows:', error);
  }
};

/**
 * Registra una penalizacion a un miembro: multa (queda pendiente de pago) o
 * dias sin poder reservar. Mientras este activa, el miembro no puede reservar.
 */
const chargeMemberPenalty = async ({ profileId, gymId, penalty, reason }) => {
  await db
    .collection('profiles')
    .doc(profileId)
    .update({ penaltyActive: true });

  const penaltyDetails = {
    type: penalty.type,
    amount: penalty.amount,
    reason,
  };

  await logUserPenalty(profileId, gymId, penalty.type, penaltyDetails, true);
};

/**
 * Cobra a un no miembro una penalizacion en creditos. Lo que no alcanza el
 * saldo queda como deuda (creditDebt): en ese caso la penalizacion queda activa
 * hasta que se liquide al comprar el siguiente paquete. Si se cobro entera, se
 * registra como ya cobrada (inactive) y no marca el perfil como penalizado.
 */
const chargeNonMemberPenalty = async ({ profileId, gymId, penalty, reason }) => {
  const penaltyResult = await applyCreditPenalty({
    profileId,
    penaltyAmount: penalty.amount,
  });
  const pendingDebt = penaltyResult.addedToDebt > 0;

  // penaltyActive solo se enciende aqui; lo apagan el pago o la renovacion
  if (pendingDebt) {
    await db
      .collection('profiles')
      .doc(profileId)
      .update({ penaltyActive: true });
  }

  const penaltyDetails = {
    type: 'creditsPenalty',
    amount: penalty.amount,
    reason,
    charged: penaltyResult.charged,
    addedToDebt: penaltyResult.addedToDebt,
  };

  await logUserPenalty(
    profileId,
    gymId,
    penaltyDetails.type,
    penaltyDetails,
    pendingDebt
  );
};

const chargePenalty = (audience, args) =>
  audience === 'member'
    ? chargeMemberPenalty(args)
    : chargeNonMemberPenalty(args);

/**
 * Cancelacion de una clase (miembro o no miembro):
 *  - a tiempo: gratis, no cuenta para nada y, si el paquete descuenta al
 *    reservar, se devuelve el credito;
 *  - tardia: cuenta en la ventana de 30 dias y se penaliza cuando supera las
 *    cancelaciones tardias permitidas por el manager.
 *
 * @returns {Promise<boolean>} false si el perfil no existe
 */
const handleClassCancellation = async ({
  audience,
  profileId,
  gymId,
  classId,
  classData,
  restrictions,
}) => {
  const profileRef = db.collection('profiles').doc(profileId);
  const profileDoc = await profileRef.get();

  if (!profileDoc.exists) return false;

  const profileData = profileDoc.data();
  const policy = toPolicy(restrictions, audience);
  const gymTimeZone = await getGymTimeZone(gymId);
  const localNow = getLocalTime(new Date(), gymTimeZone);

  const isLate = isLateCancellation({
    policy,
    timeUntilClassMs:
      getClassStartLocal(classData).getTime() - localNow.getTime(),
  });

  if (isLate) {
    const window = nextWindowCount({
      windowStart: profileData.first30DaysLateCancellation,
      count: profileData.lateCancellationCount,
      now: localNow,
    });

    await profileRef.update({
      first30DaysLateCancellation: window.windowStart,
      lateCancellationCount: window.count,
    });

    const decision = evaluateLateCancellation({
      policy,
      lateCancellationCount: window.count,
    });

    if (decision.penalize) {
      await chargePenalty(audience, {
        profileId,
        gymId,
        penalty: decision.penalty,
        reason: decision.reason,
      });
    }
  } else if (
    audience === 'nonMember' &&
    profileData.selectedPackage?.deductedAtBooking
  ) {
    // Cancelo a tiempo: se devuelve el credito descontado al reservar
    await profileRef.update({
      currentCredit: admin.firestore.FieldValue.increment(1),
    });
  }

  await logUserActivity(profileId, gymId, 'classCancellation', [classId]);
  return true;
};

/**
 * No show (lo llama la tarea nocturna): cuenta en la ventana de 30 dias y se
 * penaliza cuando supera los no shows permitidos por el manager.
 */
const handleNoShow = async ({
  audience,
  participantId,
  primaryClass,
  windowStartField,
}) => {
  const profileRef = db.collection('profiles').doc(participantId);
  const profileDoc = await profileRef.get();

  if (!profileDoc.exists) {
    console.error(`Perfil no encontrado para ${audience} ${participantId}`);
    return;
  }

  const policy = toPolicy(
    audience === 'member'
      ? primaryClass.memberRestrictions
      : primaryClass.nonMemberRestrictions,
    audience
  );

  // Clase sin restricciones para este tipo de socio: el no show no cuenta
  if (policy.enabled) {
    const profileData = profileDoc.data();
    const gymTimeZone = await getGymTimeZone(primaryClass.gymId);
    const localNow = getLocalTime(new Date(), gymTimeZone);

    // Antes, el no show que reiniciaba la ventana de 30 dias no se evaluaba
    const window = nextWindowCount({
      windowStart: profileData[windowStartField],
      count: profileData.noShowCount,
      now: localNow,
    });

    await profileRef.update({
      [windowStartField]: window.windowStart,
      noShowCount: window.count,
    });

    const decision = evaluateNoShow({ policy, noShowCount: window.count });

    if (decision.penalize) {
      await chargePenalty(audience, {
        profileId: participantId,
        gymId: primaryClass.gymId,
        penalty: decision.penalty,
        reason: decision.reason,
      });
    }
  }

  await logUserActivity(
    participantId,
    primaryClass.gymId,
    audience === 'member' ? 'noShow' : 'classNoShow',
    [primaryClass.classId]
  );
};

const applyMemberPenalty = (participantId, primaryClass) =>
  handleNoShow({
    audience: 'member',
    participantId,
    primaryClass,
    windowStartField: 'first30DaysNoShow',
  });

const applyNonMemberPenalty = (participantId, primaryClass) =>
  handleNoShow({
    audience: 'nonMember',
    participantId,
    primaryClass,
    windowStartField: 'first30DaysClassNoShow',
  });

const checkAndDeactivatePenalties = async (gymId) => {
  try {
    // Obtener la zona horaria del gimnasio
    const gymTimeZone = await getGymTimeZone(gymId);
    const currentTime = getLocalTime(new Date(), gymTimeZone); // Hora actual en la zona del gimnasio

    // Obtener todos los perfiles con penalidades activas
    const profilesSnapshot = await admin
      .firestore()
      .collection('profiles')
      .where('penaltyActive', '==', true)
      .get();

    for (const profileDoc of profilesSnapshot.docs) {
      const profileId = profileDoc.id;

      // Obtener penalidades activas del tipo "timeRestriction"
      const penaltiesSnapshot = await admin
        .firestore()
        .collection('profiles')
        .doc(profileId)
        .collection('userPenalties')
        .where('status', '==', 'active')
        .where('penaltyType', '==', 'timeRestriction')
        .orderBy('timestamp', 'asc') // Ordenar penalidades por la fecha y hora de creación
        .get();

      for (const penaltyDoc of penaltiesSnapshot.docs) {
        const penalty = penaltyDoc.data();
        const penaltyTimestamp = new Date(penalty.timestamp); // Convertir el string ISO a un objeto Date
        const penaltyDays = penalty.details.amount; // Días de penalización (en este caso sería 2 días)

        // Calculamos la fecha de expiración de la penalidad
        const penaltyExpirationDate = new Date(penaltyTimestamp);
        penaltyExpirationDate.setDate(
          penaltyExpirationDate.getDate() + penaltyDays
        );

        // Calcular cuántos días han pasado desde la penalización
        const daysSincePenalty = Math.floor(
          (currentTime - penaltyTimestamp) / (1000 * 60 * 60 * 24)
        );

        // Si han pasado al menos 'penaltyDays' desde que se impuso la penalización, desactivar una penalidad
        if (daysSincePenalty >= penaltyDays) {
          await admin
            .firestore()
            .collection('profiles')
            .doc(profileId)
            .collection('userPenalties')
            .doc(penaltyDoc.id)
            .update({ status: 'inactive' });

          // Salir del loop después de desactivar una penalidad
          break;
        }
      }

      // Si ya no quedan penalidades activas, desactivar el campo penaltyActive
      const remainingActivePenalties = await admin
        .firestore()
        .collection('profiles')
        .doc(profileId)
        .collection('userPenalties')
        .where('status', '==', 'active')
        .get();

      if (remainingActivePenalties.empty) {
        await admin
          .firestore()
          .collection('profiles')
          .doc(profileId)
          .update({ penaltyActive: false });
      }
    }
  } catch (error) {
    console.error('Error al revisar y desactivar penalidades:', error);
  }
};

module.exports = {
  getUserPenalties,
  addClassUnknownParticipants,
  addClassParticipants,
  cancelMemberClass,
  cancelMemberCourt,
  getUnknownMemberClassesByProfileId,
  getmemberClassesByProfileId,
  getUnknownMemberCourtsByProfileId,
  getmemberCourtsByProfileId,
  addToMemberWaitingList,
  addToUnknownMemberWaitingList,
  payPenalty,
  updatePenaltyStatus,
  penalizeNoShows,
  checkAndDeactivatePenalties,
};
