const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const moment = require('moment');

const addClassUnknownParticipants = async (req, res) => {
  try {
    const classId = req.body.classId;
    const profileId = req.body.profileId;

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
    } = profileDoc;

    const currentCredit = profileDoc.currentCredit;
    const deductedAtBooking = profileDoc.selectedPackage.deductedAtBooking;

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
      currentCredit: currentCredit,
      selectedPackage: selectedPackage,
      cardSerialNumber: cardSerialNumber,
    };

    // Obtén la referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén la referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();

    // Si la clase no existe, crea un nuevo documento con el campo participants inicializado en 1
    if (!classDoc.exists) {
      await classDocRef.set({
        unknownParticipants: [participant],
        currentUnkwnownClassParticipants: 1,
      });

      return res.status(200).json({
        message: 'Participantes agregados con éxito',
        currentUnkwnownClassParticipants: 1,
      });
    }

    // Obtiene el campo de participantes actual
    const currentParticipants = classDoc.data().unknownParticipants || [];

    const alreadyAdded = currentParticipants.some(
      (p) => p.profileId === profileDoc.profileId
    );

    if (alreadyAdded) {
      return res
        .status(400)
        .json({ message: 'You are already a participant in this class' });
    }

    // Actualiza el campo de participantes utilizando arrayUnion
    await classDocRef.update({
      unknownParticipants: admin.firestore.FieldValue.arrayUnion(participant),
      currentUnkwnownClassParticipants: currentParticipants.length + 1,
    });

    return res.status(200).json({
      message: 'Successfully added to the class.',
      currentUnkwnownClassParticipants: currentParticipants.length + 1,
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

    const profileSnapshot = await db
      .collection('profiles')
      .where('profileId', '==', profileId)
      .get();

    if (profileSnapshot.empty) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    const profileDoc = profileSnapshot.docs[0].data();

    const participant = {
      profileId: profileDoc.profileId,
      profileEmail: profileDoc.profileEmail,
      profileTelephoneNumber: profileDoc.profileTelephoneNumber,
      profileName: profileDoc.profileName,
      profilePicture: profileDoc.profilePicture,
      cardSerialNumber: profileDoc.cardSerialNumber,
    };

    // Obtén la referencia a la colección de clases
    const classesCollection = db.collection('classes');

    // Obtén la referencia al documento de la clase por ID
    const classDocRef = classesCollection.doc(classId);

    // Verifica si la clase existe
    const classDoc = await classDocRef.get();

    // Si la clase no existe, crea un nuevo documento con el campo participants inicializado en 1
    if (!classDoc.exists) {
      await classDocRef.set({
        participants: [participant],
        currentClassParticipants: 1,
      });

      return res.status(200).json({
        message: 'Participantes agregados con éxito',
        currentClassParticipants: 1,
      });
    }

    // Obtiene el campo de participantes actual
    const currentParticipants = classDoc.data().participants || [];

    const alreadyAdded = currentParticipants.some(
      (p) => p.profileId === profileDoc.profileId
    );

    if (alreadyAdded) {
      return res
        .status(400)
        .json({ message: 'You are already a participant in this class' });
    }

    // Actualiza el campo de participantes utilizando arrayUnion
    await classDocRef.update({
      participants: admin.firestore.FieldValue.arrayUnion(participant),
      currentClassParticipants: currentParticipants.length + 1,
    });

    return res.status(200).json({
      message: 'Successfully added to the class.',
      currentClassParticipants: currentParticipants.length + 1,
    });
  } catch (error) {
    console.error('Error al agregar participantes:', error);
    return res
      .status(500)
      .json({ message: 'Error interno del servidor al agregar participantes' });
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
    snapshot.forEach((doc) => {
      const classData = doc.data();
      // Verificar si el profileId está en el array de unknownParticipants, si existe
      if (
        classData.unknownParticipants &&
        classData.unknownParticipants.some(
          (participant) => participant.profileId === profileId
        )
      ) {
        classes.push(classData);
      }
    });

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
    snapshot.forEach((doc) => {
      const classData = doc.data();
      if (
        classData.participants &&
        classData.participants.some(
          (participant) => participant.profileId === profileId
        )
      ) {
        classes.push(classData);
      }
    });

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

    if (role === 'member') {
      // Eliminar miembro del array de participants
      const updatedParticipants = classData.participants.filter(
        (participant) => participant.profileId !== profileId
      );

      await classRef.update({
        participants: updatedParticipants,
        currentClassParticipants: classData.currentClassParticipants - 1,
      });

      return res.status(200).json({ message: 'Member removed from class' });
    } else if (role === 'unknownMember') {
      // Eliminar miembro del array de unknownParticipants
      const updatedUnknownParticipants = classData.unknownParticipants.filter(
        (participant) => participant.profileId !== profileId
      );
      await classRef.update({
        unknownParticipants: updatedUnknownParticipants,
        currentUnkwnownClassParticipants:
          classData.currentUnkwnownClassParticipants - 1,
      });

      // // Referencia al perfil del usuario
      // const profileRef = db.collection('profiles').doc(profileId);
      // const profileDoc = await profileRef.get();

      // if (!profileDoc.exists) {
      //   return res.status(404).json({ error: 'Profile not found' });
      // }

      // const profileData = profileDoc.data();

      // // Devolver crédito si deductedAtBooking es true
      // if (profileData.selectedPackage.deductedAtBooking) {
      //   await profileRef.update({
      //     'selectedPackage.currentCredit':
      //       profileData.selectedPackage.currentCredit + 1,
      //   });
      // }

      return res.status(200).json({
        message: 'Unknown member removed from class',
      });
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
