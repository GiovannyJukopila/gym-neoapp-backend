const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const moment = require('moment');

const createPrepaidPackage = async (req, res) => {
  try {
    const body = req.body;

    const gymId = req.query.gymId;
    // Genera el número secuencial utilizando la función
    const packageSerialNumber = await generateSequentialNumber(gymId);

    // Genera el nombre del documento
    const documentName = `prepaidpackage-${gymId}-${packageSerialNumber}`;
    // Crea el nuevo documento en la colección "memberships" en Firebase
    const profilesCollection = db.collection('prepaidpackages');
    const newProfileRef = profilesCollection.doc(documentName);
    await newProfileRef.set(body);

    const gymsCollection = db.collection('gyms');
    await gymsCollection.doc(gymId).update({
      prepaidpackagesLastSerialNumber: documentName,
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
    let gymprepaidpackages = metadataDoc.exists
      ? metadataDoc.data().gymprepaidpackages
      : 0;

    // Incrementa el valor de gymCourts
    gymprepaidpackages++;

    // Actualiza el número de secuencia en "metadata"
    await metadataRef.set({ gymprepaidpackages }, { merge: true });

    // Devuelve el número secuencial formateado
    return gymprepaidpackages;
  } catch (error) {
    console.error('Error generating sequential number:', error);
    throw error; // Puedes manejar el error según tus necesidades
  }
}

const getAllPrepaidPackages = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getprepaidpackagesCollection = db.collection('prepaidpackages');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getprepaidpackagesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const prepaidpackagesArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const prepaidpackage = {
        id: doc.id,
        creditNumber: data.creditNumber,
        deductedAtBooking: data.deductedAtBooking, // Si descriptions no está definido, usar un array vacío
        prepaymentType: data.prepaymentType, // Si gymId no está definido, usar una cadena vacía
        refundCredit: data?.refundCredit,
        transferCredit: data?.transferCredit,
        prepaymentPackageName: data?.prepaymentPackageName,
        packagePrice: data?.packagePrice,
      };
      prepaidpackagesArray.push(prepaidpackage);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(prepaidpackagesArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

const getAllPrepaidInactiveCards = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = 100;

    const getprepaidpackagesCollection = db.collection('cards');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getprepaidpackagesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .where('prepaidCard', '==', true)
      .where('cardStatus', '==', 'inactive')
      .orderBy('cardSerialNumber', 'asc')
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const prepaidpackagesCardsArray = [];
    response.forEach((doc) => {
      const data = doc.data();
      const prepaidCardspackage = {
        id: doc.id,
        cardSerialNumber: data.cardSerialNumber,
        cardStatus: data.cardStatus, // Si descriptions no está definido, usar un array vacío
        prepaidCard: data.prepaidCard, // Si gymId no está definido, usar una cadena vacía
        qrImage: data?.qrImage,
      };
      prepaidpackagesCardsArray.push(prepaidCardspackage);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(prepaidpackagesCardsArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

const getAllPrepaidActiveCards = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = 100;

    const getprepaidpackagesCollection = db.collection('cards');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getprepaidpackagesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .where('prepaidCard', '==', true)
      .where('cardStatus', '==', 'active')
      .orderBy('cardSerialNumber', 'asc')
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    const prepaidpackagesCardsArray = [];
    response.forEach((doc) => {
      const data = doc.data();

      const prepaidCardspackage = {
        id: doc.id,
        cardSerialNumber: data.cardSerialNumber,
        cardStatus: data.cardStatus, // Si descriptions no está definido, usar un array vacío
        prepaidCard: data.prepaidCard, // Si gymId no está definido, usar una cadena vacía
        qrImage: data?.qrImage,
      };
      prepaidpackagesCardsArray.push(prepaidCardspackage);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(prepaidpackagesCardsArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};

const deletePrepaidPackage = async (req, res) => {
  try {
    const prepaidPackageId = req.params.id;
    const db = admin.firestore();
    const classRef = db.collection('prepaidpackages').doc(prepaidPackageId);

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
        const gymprepaidpackages = data.gymprepaidpackages - 1;

        await metadataRef.update({ gymprepaidpackages });
      }
    }

    res.status(204).send(); // Respuesta exitosa sin contenido
  } catch (error) {
    console.error('Error deleting membership:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const searchInactiveCardNumber = async (req, res) => {
  try {
    let searchTerm = req.query.term; // Obtén el término de búsqueda y elimina espacios adicionales
    searchTerm = searchTerm.trim().toUpperCase(); // Convierte a mayúsculas y elimina espacios al principio y al final

    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    const profilesRef = db.collection('cards');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId) // Filtrar por gymId
      .where('prepaidCard', '==', true)
      .where('cardStatus', '==', 'inactive')
      .where('cardSerialNumber', '==', searchTerm) // Operador de rango// Operador de rango
      .get();

    const profiles = [];

    snapshot.forEach((doc) => {
      profiles.push(doc.data());
    });

    if (profiles.length === 0) {
      res.status(404).json({ message: 'Perfiles no encontrados' });
    } else {
      res.json(profiles);
    }
  } catch (error) {
    console.error('Error al buscar perfiles por número de tarjeta:', error);
    res.status(500).json({
      error: 'Error al buscar perfiles por número de tarjeta',
    });
  }
};

const searchActiveCardNumber = async (req, res) => {
  try {
    let searchTerm = req.query.term; // Obtén el término de búsqueda y elimina espacios adicionales
    searchTerm = searchTerm.trim().toUpperCase(); // Convierte a mayúsculas y elimina espacios al principio y al final

    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    const profilesRef = db.collection('cards');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId) // Filtrar por gymId
      .where('prepaidCard', '==', true)
      .where('cardStatus', '==', 'active')
      .where('cardSerialNumber', '==', searchTerm) // Operador de rango// Operador de rango
      .get();

    const profiles = [];

    snapshot.forEach((doc) => {
      profiles.push(doc.data());
    });

    if (profiles.length === 0) {
      res.status(404).json({ message: 'Perfiles no encontrados' });
    } else {
      res.json(profiles);
    }
  } catch (error) {
    console.error('Error al buscar perfiles por número de tarjeta:', error);
    res.status(500).json({
      error: 'Error al buscar perfiles por número de tarjeta',
    });
  }
};

const createUnknownMember = async (req, res) => {
  try {
    const profilesRef = db.collection('profiles');
    const metadataRef = db.collection('metadata').doc('lastProfileNumber');

    // Inicia una transacción para asegurarte de obtener y actualizar el último número de perfil de manera segura.
    await db.runTransaction(async (transaction) => {
      // Obtiene el último número de perfil
      const metadataDoc = await transaction.get(metadataRef);
      const lastProfileNumber = metadataDoc.data().value;

      // Verifica si existe un perfil con el mismo cardSerialNumber
      const cardSerialNumber = req.body.cardSerialNumber;
      const existingProfileQuery = await profilesRef
        .where('cardSerialNumber', '==', cardSerialNumber)
        .get();

      // Si existe un perfil con el mismo cardSerialNumber, elimina el cardSerialNumber de ese perfil
      if (!existingProfileQuery.empty) {
        existingProfileQuery.forEach(async (doc) => {
          await transaction.update(doc.ref, { cardSerialNumber: '' });
        });
      }

      const cardRef = db.collection('cards').doc(req.body.cardSerialNumber);
      transaction.update(cardRef, { cardStatus: 'active' });

      // Calcula el nuevo número de perfil
      const newProfileNumber = lastProfileNumber + 1;

      // Actualiza el documento "lastProfileNumber" en metadata con el nuevo número
      transaction.update(metadataRef, { value: newProfileNumber });

      // Crea el ID de perfil con el nuevo número
      const newProfileId = `profile-${newProfileNumber}`;

      // Resto de los campos del perfil
      const profileData = {
        profileId: newProfileId,
        gymId: req.body.gymId,
        cardSerialNumber: req.body.cardSerialNumber,
        profileName: req.body.fullName,
        unknownMemberEmail: req.body.email,
        unknownMemberPhoneNumber: req.body.phoneNumber,
        selectedPackage: req.body.selectedPackage,
        currentCredit: req.body.selectedPackage.creditNumber,
        totalReceive: req.body.fee,
        unknownMemberNotes: req.body.notes,
        unknownMemberStatus: 'active',
        role: ['unknownMember'],
        memberType: 'unknownmember',
        profilePicture: req.body.profilePicture,
      };

      // Crea el nuevo perfil
      await profilesRef.doc(newProfileId).set(profileData);

      const paymentHistoryRef = db.collection('paymentHistory');
      const newPaymentHistoryDoc = paymentHistoryRef.doc();
      const paymentId = newPaymentHistoryDoc.id;
      // Crear un documento en la colección paymentHistory con el paymentAmount
      const paymentHistoryData = {
        paymentId: paymentId,
        profileId: newProfileId,
        gymId: req.body.gymId,
        memberType: 'unknownmember',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentType: 'prepaidPackage',
        cardSerialNumber: req.body.cardSerialNumber,
        Note: req.body.notes,
        paymentPackage: req.body.selectedPackage,
        paymentAmount: req.body.fee, // Establecer el paymentAmount obtenido del membership
        // ... (otros datos relacionados con el pago o historial)
      };

      await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

      // Responde con éxito
      res
        .status(201)
        .json({ message: 'Perfil creado con éxito', profile: profileData });
    });
  } catch (error) {
    console.error('Error al crear el perfil:', error);
    res.status(500).json({ error: 'Error al crear el perfil' });
  }
};

const getCardDetail = async (req, res) => {
  try {
    const cardSerialNumber = req.params.cardNumber; // Obtén el número de tarjeta de los parámetros de la solicitud
    const profilesRef = db.collection('profiles');

    // Realiza la consulta para obtener el perfil con el cardSerialNumber y el unknownMemberStatus igual a 'active'
    const querySnapshot = await profilesRef
      .where('cardSerialNumber', '==', cardSerialNumber)
      .where('unknownMemberStatus', '==', 'active')
      .get();

    if (querySnapshot.empty) {
      // Si no se encontró ningún perfil que cumpla con los criterios de búsqueda

      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    // Se encontró al menos un perfil que cumple con los criterios de búsqueda
    // En este ejemplo, asumiendo que solo hay un perfil con este cardSerialNumber y unknownMemberStatus 'active'
    const profileData = querySnapshot.docs[0].data();

    // Responde con los detalles del perfil encontrado
    res.status(200).json({ profile: profileData });
  } catch (error) {
    console.error('Error al obtener detalles de la tarjeta:', error);
    res.status(500).json({ error: 'Error al obtener detalles de la tarjeta' });
  }
};

const updateUnknownMember = async (req, res) => {
  try {
    const {
      profileName,
      unknownMemberEmail,
      unknownMemberPhoneNumber,
      selectedPackage,
      totalReceive,
      unknownMemberNotes,
      profilePicture,
      currentCredit,
    } = req.body;
    const { cardSerialNumber, gymId } = req.body;

    const formData = {
      profileName,
      unknownMemberEmail,
      unknownMemberPhoneNumber,
      selectedPackage,
      totalReceive,
      unknownMemberNotes,
      profilePicture,
      currentCredit,
    };

    const profileRef = db
      .collection('profiles')
      .where('cardSerialNumber', '==', cardSerialNumber)
      .where('gymId', '==', gymId);

    const querySnapshot = await profileRef.get();

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      await doc.ref.update(formData);
      res.json({ message: 'Profile record updated successfully' });
    } else {
      res.status(404).json({
        error: 'No profile found with the provided cardSerialNumber and gymId',
      });
    }
  } catch (error) {
    res.status(400).send(error.message);
  }
};
const removeUnknownMemberCard = async (req, res) => {
  try {
    const cardSerialNumber = req.params.id;

    // Query the profile collection to find documents with the given cardSerialNumber
    const querySnapshot = await db
      .collection('profiles')
      .where('cardSerialNumber', '==', cardSerialNumber)
      .get();

    // Update each matching document
    const batch = db.batch();
    querySnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        cardSerialNumber: '',
        unknownMemberStatus: 'inactive',
      });
    });
    await batch.commit();

    const cardRef = db.collection('cards').doc(cardSerialNumber);
    await cardRef.update({ cardStatus: 'inactive' });

    res
      .status(200)
      .json({ message: 'Card data removed and marked as inactive.' });
  } catch (error) {
    console.error('Error removing card data:', error);
    res
      .status(500)
      .json({ message: 'An error occurred while removing card data.' });
  }
};

const refundUnknownMemberCard = async (req, res) => {
  try {
    const cardSerialNumber = req.params.cardId;

    const profileRef = db
      .collection('profiles')
      .where('cardSerialNumber', '==', cardSerialNumber);
    const profileSnapshot = await profileRef.get();

    // Update each matching document
    const batch = db.batch();
    profileSnapshot.forEach((doc) => {
      const currentCredit = doc.data().currentCredit || 0;
      const updatedCredit = currentCredit + 1;
      batch.update(doc.ref, { currentCredit: updatedCredit });
    });
    await batch.commit();
    res
      .status(200)
      .json({ message: 'Card data removed and marked as inactive.' });
  } catch (error) {
    console.error('Error removing card data:', error);
    res
      .status(500)
      .json({ message: 'An error occurred while removing card data.' });
  }
};

const sendUnknownMemberAttendance = async (req, res) => {
  try {
    const { selectedOption, selectedValue, profileDetails } = req.body;
    const currentCredit = profileDetails.currentCredit;
    const deductedAtBooking = profileDetails.deductedAtBooking;
    const profileId = profileDetails.profileId;
    const cardSerialNumber = profileDetails.cardSerialNumber;
    let activityId;

    if (currentCredit === 0) {
      return res.status(400).json({
        message: 'This member does not have available credit',
      });
    }

    if (selectedOption === 'class') {
      const classId = selectedValue.classId;
      activityId = classId;
      const unknownClassCapacity = selectedValue?.unknownClassCapacity;

      let remainingCapacity;
      if (
        selectedValue.unknownParticipants &&
        selectedValue.unknownParticipants.length >= 0
      ) {
        const currentParticipants = selectedValue.unknownParticipants.length;

        remainingCapacity = unknownClassCapacity - currentParticipants;
        if (remainingCapacity <= 0) {
          return res.status(400).json({
            message: 'There are no available slots in the selected class',
          });
        }
      } else {
        remainingCapacity = unknownClassCapacity;
      }
      const classesCollection = db.collection('classes');
      const classDocRef = classesCollection.doc(classId);
      const classDoc = await classDocRef.get();
      if (!classDoc.exists) {
        return res.status(404).json({
          message: 'Class not found',
        });
      }

      // Verificar si el perfil de la persona ya está en unknownParticipants
      const isParticipantExist = selectedValue.unknownParticipants.some(
        (participant) => participant.profileId === profileDetails.profileId
      );

      if (!isParticipantExist) {
        // Si el perfil de la persona no está en unknownParticipants, agregarlo
        const participantDetails = {
          ...profileDetails,
          profileTelephoneNumber: profileDetails.unknownMemberPhoneNumber,
          profileEmail: profileDetails.unknownMemberEmail,
          // Agregar otros detalles del participante según sea necesario
        };
        delete participantDetails.unknownMemberPhoneNumber;
        delete participantDetails.unknownMemberEmail;

        await classDocRef.update({
          unknownParticipants:
            admin.firestore.FieldValue.arrayUnion(participantDetails),
          currentUnkwnownClassParticipants:
            admin.firestore.FieldValue.increment(1),
        });
      }
    } else {
      activityId = selectedValue.sessionId;
    }

    if (!deductedAtBooking) {
      // Restar 1 crédito del currentCredit del memberForm
      profileDetails.currentCredit--;

      // Actualizar el currentCredit en el perfil de la persona
      const profileRef = db.collection('profiles').doc(profileId);
      await profileRef.update({
        currentCredit: admin.firestore.FieldValue.increment(-1),
      });
    }

    const attendanceHistoryRef = db.collection('attendanceHistory');
    await attendanceHistoryRef.add({
      gymId: profileDetails.gymId,
      activityId: activityId,
      profileId: profileId,
      cardSerialNumber: cardSerialNumber,
      attendanceDate: new Date(),
      currentCredit: currentCredit - 1,
    });

    res.status(200).json({ message: 'Received data successfully.' });
  } catch (error) {
    console.error('Error handling unknown member attendance:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
};

const renewprepaidpackage = async (req, res) => {
  try {
    const body = req.body;
    const gymId = body.gymId; // Obtener el ID del gimnasio
    const cardSerialNumber = body.cardSerialNumber; // Obtener el número de serie de la tarjeta

    // Actualizar la información del miembro desconocido en la colección profiles
    const profileRef = db.collection('profiles');
    const querySnapshot = await profileRef
      .where('cardSerialNumber', '==', cardSerialNumber)
      .where('gymId', '==', gymId)
      .get();

    // Actualizar cada documento encontrado en la consulta
    const batch = db.batch();
    querySnapshot.forEach((doc) => {
      batch.update(doc.ref, body);
    });
    await batch.commit();

    // Generar el historial de pagos en la colección paymentHistory
    const paymentHistoryRef = db.collection('paymentHistory');
    const newPaymentHistoryDoc = paymentHistoryRef.doc();
    const paymentId = newPaymentHistoryDoc.id;

    // Crear un documento en la colección paymentHistory
    const paymentHistoryData = {
      paymentId: paymentId,
      profileId: body.profileId,
      gymId: gymId,
      memberType: 'unknownmember',
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentType: 'prepaidPackage',
      cardSerialNumber: cardSerialNumber,
      Note: body.unknownMemberNotes,
      paymentPackage: body.selectedPackage,
      paymentAmount: body.totalReceive,
      // Otros datos relacionados con el pago o historial
    };

    await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

    res.status(200).json({ message: 'Unknown member updated successfully' });
  } catch (error) {
    console.error('Error updating unknown member:', error);
    res
      .status(500)
      .json({ message: 'An error occurred while updating unknown member' });
  }
};

module.exports = {
  getAllPrepaidPackages,
  getAllPrepaidInactiveCards,
  createPrepaidPackage,
  deletePrepaidPackage,
  searchInactiveCardNumber,
  createUnknownMember,
  searchActiveCardNumber,
  getAllPrepaidActiveCards,
  getCardDetail,
  updateUnknownMember,
  removeUnknownMemberCard,
  refundUnknownMemberCard,
  renewprepaidpackage,
  sendUnknownMemberAttendance,
};
