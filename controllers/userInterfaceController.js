const express = require('express');
const app = express();
const { db } = require('../firebase');
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

    // Obtener la referencia a la subcolección de penalties dentro del perfil (profile)
    const penaltiesSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .collection('userPenalties')
      .where('status', '==', 'active') // Filtrar solo los penalties con status "active"
      .get();

    if (penaltiesSnapshot.empty) {
      return res.status(404).json({ message: 'No active penalties found' });
    }

    // Extraer los datos de las penalizaciones activas
    const activePenalties = penaltiesSnapshot.docs.map((doc) => {
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

    if (currentCredit === 0) {
      return res.status(400).json({
        message: 'You do not have available credit',
      });
    }

    if (deductedAtBooking) {
      // Actualizar el currentCredit en el perfil de la persona
      const profileRef = db.collection('profiles').doc(profileId);
      await profileRef.update({
        currentCredit: admin.firestore.FieldValue.increment(-1),
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

    return res.status(200).json(classes);
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

      // Verificar si el profileId está en la subcolección
      const participantSnapshot = await participantsCollectionRef
        .doc(profileId)
        .get();

      if (participantSnapshot.exists) {
        // Obtener todos los participantes para esta clase
        const participantsSnapshot = await participantsCollectionRef.get();
        const participants = participantsSnapshot.docs.map((doc) => doc.data());

        // Añadir los datos de la clase junto con los participantes
        classes.push({
          ...classData,
          participants: participants,
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

    // Eliminar el participante actual
    const participantQuery = await participantsCollectionRef
      .where('profileId', '==', profileId)
      .get();

    if (participantQuery.empty) {
      return res.status(404).json({ error: 'Member not found in class' });
    }

    // Eliminar al participante de la colección
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

    if (
      primaryClassData?.memberRestrictions?.restrictions &&
      role === 'member'
    ) {
      const profileRef = db.collection('profiles').doc(profileId);
      const profileDoc = await profileRef.get();

      if (!profileDoc.exists) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const profileData = profileDoc.data();
      const { first30DaysClassCancelation = null, cancellationCount = 0 } =
        profileData;

      const gymTimeZone = await getGymTimeZone(gymId);

      // Obtener la hora local en la zona horaria del gimnasio
      const localNow = getLocalTime(new Date(), gymTimeZone); // Pasamos el timestamp actual ajustado a moment
      let first30DaysDate;

      if (!first30DaysClassCancelation) {
        // Si no hay fecha de primera cancelación, establecer la fecha actual
        first30DaysDate = localNow;
        await profileRef.update({
          first30DaysClassCancelation: localNow.toISOString(), // Guardar la fecha en formato ISO
        });
      } else {
        // Si ya existe una fecha, convertirla en objeto Date
        first30DaysDate = new Date(first30DaysClassCancelation);
      }

      // Calcular la diferencia en milisegundos
      const diffMs = localNow.getTime() - first30DaysDate.getTime();

      // Convertir la diferencia a días
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let updatedCancellationCount = cancellationCount + 1;
      let penaltyDetails = null;

      const classStartTime = classData.startTime; // "11:00"
      const classEventDate = new Date(classData.eventDate); // "2024-09-25T00:00:00.000Z"

      // Validar si el usuario está dentro del tiempo permitido para cancelar sin penalización
      let penaltyWaiveTime = null;
      if (primaryClassData.memberRestrictions.penaltyWaiveUnit === 'days') {
        penaltyWaiveTime =
          primaryClassData.memberRestrictions.penaltyWaiveDays *
          24 *
          60 *
          60 *
          1000; // Convertir días a milisegundos
      } else if (
        primaryClassData.memberRestrictions.penaltyWaiveUnit === 'hours'
      ) {
        penaltyWaiveTime =
          primaryClassData.memberRestrictions.penaltyWaiveHours *
          60 *
          60 *
          1000; // Convertir horas a milisegundos
      }

      // Calcular el tiempo hasta el inicio de la clase
      const timeUntilClassStart = classEventDate.getTime() - localNow.getTime();

      if (diffDays > 30) {
        // Resetear el contador de cancelaciones y actualizar la fecha
        updatedCancellationCount = 1;
        await profileRef.update({
          first30DaysClassCancelation: localNow.toISOString(), // Guardar la fecha en formato ISO
          cancellationCount: updatedCancellationCount,
        });
      } else {
        // Incrementar el contador de cancelaciones
        await profileRef.update({
          cancellationCount: updatedCancellationCount,
        });

        const maxCancellations =
          primaryClassData.memberRestrictions.maxCancellationsPer30Days;
        if (
          maxCancellations &&
          (updatedCancellationCount > maxCancellations ||
            timeUntilClassStart <= penaltyWaiveTime)
        ) {
          const penaltyType = primaryClassData.memberRestrictions.penaltyType; // Obtener el tipo de penalización
          let penaltyAmount = 0;
          let reason = '';

          if (penaltyType === 'monetary') {
            penaltyAmount = primaryClassData.memberRestrictions.monetaryAmount;
          } else if (penaltyType === 'timeRestriction') {
            penaltyAmount =
              primaryClassData.memberRestrictions.timeRestrictionDays;
          }

          if (updatedCancellationCount > maxCancellations) {
            reason = `Exceeded the maximum allowed cancellations of ${maxCancellations} within 30 days.`;
          } else if (timeUntilClassStart <= penaltyWaiveTime) {
            const penaltyUnit =
              primaryClassData.memberRestrictions.penaltyWaiveUnit;
            const penaltyWaiveValue =
              penaltyUnit === 'hours'
                ? primaryClassData.memberRestrictions.penaltyWaiveHours
                : primaryClassData.memberRestrictions.penaltyWaiveDays;

            reason = `Cancellation occurred less than ${penaltyWaiveValue} ${penaltyUnit} before the class started.`;
          }

          await profileRef.update({
            penaltyActive: true, // Establecer penaltyActive a true cuando se impone una penalización
          });

          const penaltyDetails = {
            type: penaltyType,
            amount: penaltyAmount,
            reason,
          };

          await logUserPenalty(
            profileId,
            gymId,
            penaltyDetails.type,
            penaltyDetails,
            true
          );
        }
      }

      // Registrar la actividad de la cancelación
      await logUserActivity(profileId, gymId, 'classCancellation', [classId]);
    }

    if (
      primaryClassData?.nonMemberRestrictions?.restrictions &&
      role === 'unknownMember'
    ) {
      const profileRef = db.collection('profiles').doc(profileId);
      const profileDoc = await profileRef.get();

      if (!profileDoc.exists) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const profileData = profileDoc.data();
      const { first30DaysClassCancelation = null, cancellationCount = 0 } =
        profileData;

      const gymTimeZone = await getGymTimeZone(gymId);

      // Obtener la hora local en la zona horaria del gimnasio
      const localNow = getLocalTime(new Date(), gymTimeZone); // Pasamos el timestamp actual ajustado a moment
      let first30DaysDate;

      if (!first30DaysClassCancelation) {
        // Si no hay fecha de primera cancelación, establecer la fecha actual
        first30DaysDate = localNow;
        await profileRef.update({
          first30DaysClassCancelation: localNow.toISOString(), // Guardar la fecha en formato ISO
        });
      } else {
        // Si ya existe una fecha, convertirla en objeto Date
        first30DaysDate = new Date(first30DaysClassCancelation);
      }

      // Calcular la diferencia en milisegundos
      const diffMs = localNow.getTime() - first30DaysDate.getTime();

      // Convertir la diferencia a días
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      let updatedCancellationCount = cancellationCount + 1;

      const classStartTime = classData.startTime; // "11:00"
      const classEventDate = new Date(classData.eventDate); // "2024-09-25T00:00:00.000Z"

      // Validar si el usuario está dentro del tiempo permitido para cancelar sin penalización
      let penaltyWaiveTime = null;
      if (
        primaryClassData.nonMemberRestrictions.penaltyNonMemberWaiveUnit ===
        'days'
      ) {
        penaltyWaiveTime =
          primaryClassData.nonMemberRestrictions.penaltyNonMemberWaiveDays *
          24 *
          60 *
          60 *
          1000; // Convertir días a milisegundos
      } else if (
        primaryClassData.nonMemberRestrictions.penaltyNonMemberWaiveUnit ===
        'hours'
      ) {
        penaltyWaiveTime =
          primaryClassData.nonMemberRestrictions.penaltyNonMemberWaiveHours *
          60 *
          60 *
          1000; // Convertir horas a milisegundos
      }

      // Calcular el tiempo hasta el inicio de la clase
      const timeUntilClassStart = classEventDate.getTime() - localNow.getTime();

      if (diffDays > 30) {
        // Resetear el contador de cancelaciones y actualizar la fecha
        updatedCancellationCount = 1;
        await profileRef.update({
          first30DaysClassCancelation: localNow.toISOString(), // Guardar la fecha en formato ISO
          cancellationCount: updatedCancellationCount,
        });
      } else {
        // Incrementar el contador de cancelaciones
        await profileRef.update({
          cancellationCount: updatedCancellationCount,
        });

        const maxCancellations =
          primaryClassData.nonMemberRestrictions.maxNonMembersCancellations;

        if (
          maxCancellations &&
          (updatedCancellationCount > maxCancellations ||
            timeUntilClassStart <= penaltyWaiveTime)
        ) {
          const nonMemberCreditsPenalty =
            primaryClassData.nonMemberRestrictions.nonMemberCreditsPenalty;

          if (nonMemberCreditsPenalty && nonMemberCreditsPenalty > 0) {
            const penaltyAmount = nonMemberCreditsPenalty;
            let reason = '';

            if (updatedCancellationCount > maxCancellations) {
              reason = `Exceeded the maximum allowed cancellations of ${maxCancellations} within 30 days.`;
            } else if (timeUntilClassStart <= penaltyWaiveTime) {
              const penaltyUnit =
                primaryClassData.nonMemberRestrictions
                  .penaltyNonMemberWaiveUnit;
              const penaltyWaiveValue =
                penaltyUnit === 'hours'
                  ? primaryClassData.nonMemberRestrictions
                      .penaltyNonMemberWaiveHours
                  : primaryClassData.nonMemberRestrictions
                      .penaltyNonMemberWaiveDays;

              reason = `Cancellation occurred less than ${penaltyWaiveValue} ${penaltyUnit} before the class started.`;
            }

            // Permitir que el saldo de créditos sea negativo
            const updatedCredits = profileData.currentCredit - penaltyAmount;
            await profileRef.update({
              currentCredit: updatedCredits,
              penaltyActive: true,
            });
            const penaltyDetails = {
              type: 'creditsPenalty',
              amount: penaltyAmount,
              reason,
            };
            const penaltyStatus = updatedCredits < 0; // true si negativo, false si 0 o positivo

            await logUserPenalty(
              profileId,
              gymId,
              penaltyDetails.type,
              penaltyDetails,
              penaltyStatus // Pasar el estado como argumento
            );
          }
        }

        if (
          profileData.selectedPackage.deductedAtBooking &&
          timeUntilClassStart > penaltyWaiveTime
        ) {
          const updatedCredits = profileData.currentCredit + 1;
          await profileRef.update({
            currentCredit: updatedCredits,
          });
        }
      }

      // Registrar la actividad de la cancelación
      await logUserActivity(profileId, gymId, 'classCancellation', [classId]);
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
              await db
                .collection('profiles')
                .doc(nextProfileId)
                .update({
                  currentCredit: admin.firestore.FieldValue.increment(-1),
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

    if (currentCredit === 0) {
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

const applyMemberPenalty = async (participantId, primaryClass) => {
  const profileRef = admin
    .firestore()
    .collection('profiles')
    .doc(participantId);
  const profileDoc = await profileRef.get();

  if (!profileDoc.exists) {
    console.error(`Perfil no encontrado para miembro ${participantId}`);
    return;
  }

  const profileData = profileDoc.data();
  const { first30DaysNoShow = null, noShowCount = 0 } = profileData;

  const gymTimeZone = await getGymTimeZone(primaryClass.gymId);
  const localNow = getLocalTime(new Date(), gymTimeZone);
  let first30DaysDate;

  // Manejo de no-shows
  if (!first30DaysNoShow) {
    first30DaysDate = localNow;
    await profileRef.update({ first30DaysNoShow: localNow.toISOString() });
  } else {
    first30DaysDate = new Date(first30DaysNoShow);
  }

  const diffMs = localNow.getTime() - first30DaysDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let updatedNoShowCount = noShowCount + 1;

  if (diffDays > 30) {
    updatedNoShowCount = 1;
    await profileRef.update({
      first30DaysNoShow: localNow.toISOString(),
      noShowCount: updatedNoShowCount,
    });
  } else {
    await profileRef.update({ noShowCount: updatedNoShowCount });

    const maxNoShows = primaryClass.memberRestrictions.maxNoShowPer30Days;
    const penaltyType = primaryClass.memberRestrictions.penaltyType;

    if (updatedNoShowCount > maxNoShows) {
      let penaltyAmount = 0;
      let reason = '';

      if (penaltyType === 'monetary') {
        penaltyAmount = primaryClass.memberRestrictions.monetaryAmount;
      } else if (penaltyType === 'timeRestriction') {
        penaltyAmount = primaryClass.memberRestrictions.timeRestrictionDays;
      }

      const penaltyDetails = {
        type: penaltyType,
        amount: penaltyAmount,
        reason: `Exceeded the maximum allowed no-shows of ${maxNoShows} within 30 days.`,
      };

      // Actualizar créditos o penalización
      await profileRef.update({
        penaltyActive: true,
      });

      await logUserPenalty(
        participantId,
        primaryClass.gymId,
        penaltyDetails.type,
        penaltyDetails,
        true
      );
    }
  }

  // Registrar la actividad de no-show
  await logUserActivity(participantId, primaryClass.gymId, 'noShow', [
    primaryClass.classId,
  ]);
};

const applyNonMemberPenalty = async (participantId, primaryClass) => {
  const profileRef = admin
    .firestore()
    .collection('profiles')
    .doc(participantId);
  const profileDoc = await profileRef.get();

  if (!profileDoc.exists) {
    console.error(`Perfil no encontrado para no miembro ${participantId}`);
    return;
  }

  const profileData = profileDoc.data();
  const {
    noShowCount = 0,
    first30DaysClassNoShow = null,
    currentCredit = 0,
  } = profileData;

  const gymTimeZone = await getGymTimeZone(primaryClass.gymId);
  const localNow = getLocalTime(new Date(), gymTimeZone);
  let first30DaysDate;

  // Manejo de No Shows
  if (!first30DaysClassNoShow) {
    first30DaysDate = localNow;
    await profileRef.update({ first30DaysClassNoShow: localNow.toISOString() });
  } else {
    first30DaysDate = new Date(first30DaysClassNoShow);
  }

  const noShowDiffMs = localNow.getTime() - first30DaysDate.getTime();
  const noShowDiffDays = Math.floor(noShowDiffMs / (1000 * 60 * 60 * 24));
  let updatedNoShowCount = noShowCount + 1;

  if (noShowDiffDays > 30) {
    updatedNoShowCount = 1; // Reiniciar el conteo de no shows
    await profileRef.update({
      first30DaysClassNoShow: localNow.toISOString(),
      noShowCount: updatedNoShowCount,
    });
  } else {
    await profileRef.update({ noShowCount: updatedNoShowCount });

    const maxNonMembersNoShows =
      primaryClass.nonMemberRestrictions.maxNonMembersNoShows;
    const nonMemberCreditsPenalty =
      primaryClass.nonMemberRestrictions.nonMemberCreditsPenalty;

    if (updatedNoShowCount > maxNonMembersNoShows) {
      const penaltyAmount = nonMemberCreditsPenalty;
      const updatedCredits = currentCredit - penaltyAmount;

      await profileRef.update({
        currentCredit: updatedCredits,
        penaltyActive: true,
      });

      const penaltyDetails = {
        type: 'creditsPenalty',
        amount: penaltyAmount,
        reason: `Exceeded the maximum allowed no shows of ${maxNonMembersNoShows} within 30 days.`,
      };

      const penaltyStatus = updatedCredits < 0;

      await logUserPenalty(
        participantId,
        primaryClass.gymId,
        penaltyDetails.type,
        penaltyDetails,
        penaltyStatus
      );
    }
  }

  // Registrar la actividad de No Show
  await logUserActivity(participantId, primaryClass.gymId, 'classNoShow', [
    primaryClass.classId,
  ]);
};

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
