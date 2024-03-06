const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const Profile = require('../models/profile');

const admin = require('firebase-admin');

const createTrainer = async (req, res) => {
  try {
    const profilesRef = db.collection('profiles');
    const metadataRef = db.collection('metadata').doc('lastProfileNumber');

    // Inicia una transacción para asegurarte de obtener y actualizar el último número de perfil de manera segura.
    await db.runTransaction(async (transaction) => {
      // Obtiene el último número de perfil
      const metadataDoc = await transaction.get(metadataRef);
      const lastProfileNumber = metadataDoc.data().value;

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
        profileStartDate: req.body.profileStartDate,
        profileIsAdmin: req.body.profileIsAdmin,
        profileAdminLevel: req.body.profileAdminLevel,
        profileName: req.body.profileName,
        profileLastname: req.body.profileLastname,
        profileEmail: req.body.profileEmail,
        profileBirthday:
          req.body.profileBirthday !== undefined
            ? req.body.profileBirthday
            : '',
        profileTelephoneNumber: req.body.profileTelephoneNumber,
        profileFile: req.body.profileFile !== null ? req.body.profileFile : '',
        profileFileWasUpload: req.body.profileFileWasUpload,
        profilePicture: req.body.profilePicture,
        profileStatus: req.body.profileStatus,
        profilePostalCode:
          req.body.profilePostalCode !== null ? req.body.profilePostalCode : '',
        profileAddress: req.body.profileAddress,
        profileCity: req.body.profileCity,
        profileCountry: req.body.profileCountry,
        role: req.body.profileIsAdmin ? ['admin', 'trainer'] : ['trainer'],
        profileIsTrainer: true,
      };

      // Crea el nuevo perfil
      await profilesRef.doc(newProfileId).set(profileData);

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

const getTrainers = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getProfilesCollection = db.collection('profiles');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getProfilesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .where('role', 'array-contains', 'trainer')
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    let profileArray = [];
    response.forEach((doc) => {
      const profile = {
        profileId: doc.data().profileId,
        cardSerialNumber: doc.data().cardSerialNumber,
        membershipId: doc.data().membershipId,
        gymId: doc.data().gymId,
        profileStartDate: formatDate(doc.data().profileStartDate), // Formatear fecha de inicio
        profileEndDate: formatDate(doc.data().profileEndDate), // Formatear fecha de fin
        profileRenewDate: formatDate(doc.data().profileRenewDate),
        profileIsAdmin: doc.data().profileIsAdmin,
        profileAdminLevel: doc.data().profileAdminLevel,
        profileName: doc.data().profileName,
        profileLastname: doc.data().profileLastname,
        profileEmail: doc.data().profileEmail,
        profileBirthday: doc.data().profileBirthday,
        profileTelephoneNumber: doc.data().profileTelephoneNumber,
        profileFile: doc.data().profileFile,
        profileFileWasUpload: doc.data().profileFileWasUpload,
        profilePicture: doc.data().profilePicture,
        profileStatus: doc.data().profileStatus,
        profilePostalCode: doc.data().profilePostalCode,
        profileAddress: doc.data().profileAddress,
        profileCity: doc.data().profileCity,
        profileCountry: doc.data().profileCountry,
        profileFrozen: doc.data().profileFrozen,
        profileFrozenDays: doc.data().profileFrozenDays,
        profileFrozenStartDate: formatDate(doc.data().profileFrozenStartDate),
        profileUnFreezeStartDate: formatDate(
          doc.data().profileUnFreezeStartDate
        ),
        profileUnFreezeEndDate: formatDate(doc.data().profileUnFreezeEndDate),
        profileUnFrozen: doc.data().profileUnFrozen,
        profileFileName: doc.data().profileFileName,
        notCheckOut: doc.data().notCheckOut,
        wasCheckIn: doc.data().wasCheckIn,
        role: doc.data().role,
        profileIsTrainer: doc.data().profileIsTrainer,
      };

      profileArray.push(profile);
    });

    // Envía la respuesta como una matriz de perfiles directamente
    res.status(200).json(profileArray);
  } catch (error) {
    console.error('Error en getAllProfiles:', error);
    res.status(500).send(error);
  }
};
function formatDate(date) {
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } else if (date && typeof date === 'string') {
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) {
      return formatDate(parsedDate);
    }
  }
  return date; // Devolver tal cual si no es una instancia de Date ni una cadena válida
}

const searchTrainer = async (req, res) => {
  try {
    const term = req.query.term.toLowerCase();
    const gymId = req.query.gymId;

    const profilesRef = db.collection('profiles');
    const snapshot = await profilesRef
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'trainer')
      .get();

    const profiles = [];
    snapshot.forEach((doc) => {
      const profile = doc.data();
      // Aplicar filtro por term en profileName y profileLastname
      if (
        profile.profileName.toLowerCase().includes(term) ||
        profile.profileLastname.toLowerCase().includes(term)
      ) {
        profiles.push(profile);
      }
    });

    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).send('Error fetching profiles');
  }
};

module.exports = {
  createTrainer,
  getTrainers,
  searchTrainer,
};
