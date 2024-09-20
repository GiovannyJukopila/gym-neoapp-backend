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
    };

    // Obtener referencia a la colección de clases
    const classesCollection = db.collection('classes');
    const classDocRef = classesCollection.doc(classId);

    // Verificar si la clase existe
    const classDoc = await classDocRef.get();

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
      // console.log(courtData);
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
        if (maxCancellations && updatedCancellationCount > maxCancellations) {
          const penaltyType = primaryClassData.memberRestrictions.penaltyType; // Obtener el tipo de penalización
          let penaltyAmount = 0;

          if (penaltyType === 'monetary') {
            penaltyAmount = primaryClassData.memberRestrictions.monetaryAmount;
          } else if (penaltyType === 'timeRestriction') {
            penaltyAmount =
              primaryClassData.memberRestrictions.timeRestrictionDays;
          }

          const penaltyDetails = {
            type: penaltyType,
            amount: penaltyAmount,
          };

          await logUserPenalty(
            profileId,
            gymId,
            penaltyDetails.type,
            penaltyDetails,
            penaltyStatus
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
      let penaltyDetails = null;

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

        if (maxCancellations && updatedCancellationCount > maxCancellations) {
          const nonMemberCreditsPenalty =
            primaryClassData.nonMemberRestrictions.nonMemberCreditsPenalty;

          if (nonMemberCreditsPenalty && nonMemberCreditsPenalty > 0) {
            const penaltyAmount = nonMemberCreditsPenalty;

            // Permitir que el saldo de créditos sea negativo
            const updatedCredits = profileData.currentCredit - penaltyAmount;
            await profileRef.update({ currentCredit: updatedCredits });
            const penaltyDetails = {
              type: 'creditsPenalty',
              amount: penaltyAmount,
            };
            const penaltyStatus = updatedCredits < 0; // true si negativo, false si 0 o positivo
            await logUserPenalty(
              role,
              profileId,
              gymId,
              penaltyDetails.type,
              penaltyDetails,
              penaltyStatus // Pasar el estado como argumento
            );
          }
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

            // Actualizar el contador de la lista de espera si es necesario
            if (waitingListCounterField) {
              const updatedWaitingListSnapshot =
                await waitingListCollectionRef.get();
              const currentWaitingListCount =
                updatedWaitingListSnapshot.size - 1;

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

            memberWithCreditFound = true; // Marcar que encontramos a un miembro con crédito
            break; // Salir del ciclo ya que encontramos un miembro con crédito
          } else {
            console.log(
              `El miembro con ID ${nextProfileId} no tiene crédito, saltando...`
            );
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

module.exports = {
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
};
