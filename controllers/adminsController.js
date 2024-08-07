const express = require('express');
const app = express();
const { db } = require('../firebase');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
app.use(bodyParser.json());
const Profile = require('../models/profile');

const admin = require('firebase-admin');

const createAdmin = async (req, res) => {
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
        profileIsTrainer: req.body.profileIsTrainer,
        profileAdminLevel: req.body.profileAdminLevel,
        profileName: req.body.profileName,
        profileLastname: req.body.profileLastname,
        profileEmail: req.body.profileEmail,
        profileBirthday:
          req.body.profileBirthday !== undefined
            ? req.body.profileBirthday
            : '',
        profileTelephoneNumber: req.body.profileTelephoneNumber,
        profileFile: req.body.profileFile ?? '',
        profilePicture: req.body.profilePicture,
        profileStatus: req.body.profileStatus,
        profilePostalCode:
          req.body.profilePostalCode !== null ? req.body.profilePostalCode : '',
        profileAddress: req.body.profileAddress,
        profileCity: req.body.profileCity,
        profileCountry: req.body.profileCountry,
        role: req.body.profileIsTrainer ? ['admin', 'trainer'] : ['admin'],
        permissions: req.body.permissions,
        profileIsTrainer: req.body.profileIsTrainer,
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

const getAdmins = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getProfilesCollection = db.collection('profiles');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getProfilesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .where('role', 'array-contains', 'admin')
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
        profileStartDate: formatDate(doc.data().profileStartDate),
        profileEndDate: formatDate(doc.data().profileEndDate),
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
        permissions: doc.data().permissions,
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

const searchAdmin = async (req, res) => {
  try {
    const term = req.query.term.toLowerCase();
    const gymId = req.query.gymId;

    const profilesRef = db.collection('profiles');
    const snapshot = await profilesRef
      .where('gymId', '==', gymId)
      .where('role', 'array-contains', 'admin')
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
const getPermissions = async (req, res) => {
  try {
    const profileId = req.params.profileId;

    // Consultar el documento en la colección 'profiles' con el profileId proporcionado
    const profileRef = db.collection('profiles').doc(profileId);
    const profileSnapshot = await profileRef.get();

    if (!profileSnapshot.exists) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    // Obtener los datos del perfil y devolver los permisos
    const profileData = profileSnapshot.data();
    return res.json({ permissions: profileData.permissions });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = {
  createAdmin,
  getAdmins,
  searchAdmin,
  getPermissions,
};
