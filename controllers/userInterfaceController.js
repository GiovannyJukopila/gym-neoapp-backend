const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const QRCode = require('qrcode');
const moment = require('moment');

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
        currentUnkwnownClassParticipants: 1,
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
    const currentUnkwnownClassParticipants = updatedParticipantsSnapshot.size;

    // Actualizar el número de participantes en el documento de la clase
    await classDocRef.update({
      currentUnkwnownClassParticipants: currentUnkwnownClassParticipants,
    });

    return res.status(200).json({
      message: 'Successfully added to the class.',
      currentUnkwnownClassParticipants: currentUnkwnownClassParticipants,
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

// const addClassParticipants = async (req, res) => {
//   try {
//     const classId = req.body.classId;
//     const profileId = req.body.profileId;

//     const profileSnapshot = await db
//       .collection('profiles')
//       .where('profileId', '==', profileId)
//       .get();

//     if (profileSnapshot.empty) {
//       return res.status(404).json({ message: 'Profile not found' });
//     }
//     const profileDoc = profileSnapshot.docs[0].data();

//     const participant = {
//       profileId: profileDoc.profileId,
//       profileEmail: profileDoc.profileEmail,
//       profileTelephoneNumber: profileDoc.profileTelephoneNumber,
//       profileName: profileDoc.profileName,
//       profilePicture: profileDoc.profilePicture,
//       cardSerialNumber: profileDoc.cardSerialNumber,
//     };

//     // Obtén la referencia a la colección de clases
//     const classesCollection = db.collection('classes');

//     // Obtén la referencia al documento de la clase por ID
//     const classDocRef = classesCollection.doc(classId);

//     // Verifica si la clase existe
//     const classDoc = await classDocRef.get();

//     // Si la clase no existe, crea un nuevo documento con el campo participants inicializado en 1
//     if (!classDoc.exists) {
//       await classDocRef.set({
//         participants: [participant],
//         currentClassParticipants: 1,
//       });

//       return res.status(200).json({
//         message: 'Participantes agregados con éxito',
//         currentClassParticipants: 1,
//       });
//     }

//     // Obtiene el campo de participantes actual
//     const currentParticipants = classDoc.data().participants || [];

//     const alreadyAdded = currentParticipants.some(
//       (p) => p.profileId === profileDoc.profileId
//     );

//     if (alreadyAdded) {
//       return res
//         .status(400)
//         .json({ message: 'You are already a participant in this class' });
//     }

//     // Actualiza el campo de participantes utilizando arrayUnion
//     await classDocRef.update({
//       participants: admin.firestore.FieldValue.arrayUnion(participant),
//       currentClassParticipants: currentParticipants.length + 1,
//     });

//     return res.status(200).json({
//       message: 'Successfully added to the class.',
//       currentClassParticipants: currentParticipants.length + 1,
//     });
//   } catch (error) {
//     console.error('Error al agregar participantes:', error);
//     return res
//       .status(500)
//       .json({ message: 'Error interno del servidor al agregar participantes' });
//   }
// };
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

    if (role === 'member') {
      // Obtener referencia a la subcolección de participants
      const participantsCollectionRef = classRef.collection('participants');

      // Buscar el participante a eliminar
      const participantQuery = await participantsCollectionRef
        .where('profileId', '==', profileId)
        .get();

      if (participantQuery.empty) {
        return res.status(404).json({ error: 'Member not found in class' });
      }

      // Eliminar el documento del participante
      const batch = db.batch();
      participantQuery.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Obtener el número actualizado de participantes
      const updatedParticipantsSnapshot = await participantsCollectionRef.get();
      const currentClassParticipants = updatedParticipantsSnapshot.size;

      // Actualizar el documento de la clase
      await classRef.update({
        currentClassParticipants: currentClassParticipants,
      });

      return res.status(200).json({ message: 'Member removed from class' });
    } else if (role === 'unknownMember') {
      // Obtener referencia a la subcolección de unknownParticipants
      const unknownParticipantsCollectionRef = classRef.collection(
        'unknownParticipants'
      );

      // Buscar el participante a eliminar
      const unknownParticipantQuery = await unknownParticipantsCollectionRef
        .where('profileId', '==', profileId)
        .get();

      if (unknownParticipantQuery.empty) {
        return res
          .status(404)
          .json({ error: 'Unknown member not found in class' });
      }

      // Eliminar el documento del participante
      const batch = db.batch();
      unknownParticipantQuery.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Obtener el número actualizado de participantes desconocidos
      const updatedUnknownParticipantsSnapshot =
        await unknownParticipantsCollectionRef.get();
      const currentUnknownClassParticipants =
        updatedUnknownParticipantsSnapshot.size;

      // Actualizar el documento de la clase
      await classRef.update({
        currentUnkwnownClassParticipants: currentUnknownClassParticipants,
      });

      return res
        .status(200)
        .json({ message: 'Unknown member removed from class' });
    } else {
      return res.status(400).json({ error: 'Invalid role' });
    }
  } catch (error) {
    console.error('Error canceling member class:', error);
    return res.status(500).json({ error: 'Internal server error' });
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

module.exports = {
  addClassUnknownParticipants,
  addClassParticipants,
  cancelMemberClass,
  cancelMemberCourt,
  getUnknownMemberClassesByProfileId,
  getmemberClassesByProfileId,
  getUnknownMemberCourtsByProfileId,
  getmemberCourtsByProfileId,
};
