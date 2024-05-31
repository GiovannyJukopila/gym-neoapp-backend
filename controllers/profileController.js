const express = require('express');
const app = express();
const { db, storage } = require('../firebase'); // Importa solo la variable storage de esta manera
const { getDownloadURL } = require('@firebase/storage');
const { getStorage, ref, uploadBytesResumable } = require('@firebase/storage');

const admin = require('firebase-admin');
const Profile = require('../models/profile');
const bodyParser = require('body-parser');

app.use(bodyParser.json());

const jwt = require('jsonwebtoken');
const secretKey = 'tu_secreto_secreto';

const createProfile = async (req, res) => {
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
        cardSerialNumber: req.body.cardSerialNumber,
        membershipId: req.body.membershipId,
        gymId: req.body.gymId,
        profileStartDate: req.body.profileStartDate,
        profileEndDate: req.body.profileEndDate,
        //profileRenewDate: req.body.profileRenewDate,
        profileIsAdmin: req.body.profileIsAdmin,
        profileAdminLevel: req.body.profileAdminLevel,
        profileName: req.body.profileName,
        profileLastname: req.body.profileLastname,
        profileEmail: req.body.profileEmail.toLowerCase(),
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
        notCheckOut: req.body.notCheckOut,
        wasCheckIn: req.body.wasCheckIn,
        role: ['member'],
        profileGender: req.body.profileGender,
        profileLastMembershipPrice: req.body.profileLastMembershipPrice,
        profileWasDiscount: req.body.profileWasDiscount,
        profileWasComplementary: req.body.profileWasComplementary,
        profileComplementaryReason:
          req.body.profileComplementaryReason !== undefined
            ? req.body.profileComplementaryReason
            : '',
        profileDiscountType: req.body.profileDiscountType,
        profileDiscountPercentage:
          req.body.profileDiscountPercentage !== undefined
            ? req.body.profileDiscountPercentage
            : '',
        profileDiscountValue:
          req.body.profileDiscountValue !== undefined
            ? req.body.profileDiscountValue
            : '',
        profileTotalReceive: req.body.profileTotalReceive,
        profileCoupleName: req?.body?.profileCoupleName,
        profileCoupleEmail: req?.body?.profileCoupleEmail,
        profileNotes: req?.body?.profileNotes,
      };

      // Crea el nuevo perfil
      await profilesRef.doc(newProfileId).set(profileData);

      const membershipsRef = db.collection('memberships');
      const membershipSnapshot = await membershipsRef
        .doc(req.body.membershipId) // Utilizar el membershipId del perfil
        .get();

      // Verificar si se encontró el membership y obtener el precio
      const currentDate = new Date();

      // Obtener el año, mes y día de la fecha actual
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Agregar ceros iniciales si es necesario
      const day = String(currentDate.getDate()).padStart(2, '0'); // Agregar ceros iniciales si es necesario

      // Crear el string de la fecha en el formato 'YYYY-MM-DD'
      const formattedDate = `${year}-${month}-${day}`;
      const paymentHistoryRef = db.collection('paymentHistory');
      const newPaymentHistoryDoc = paymentHistoryRef.doc();
      const paymentId = newPaymentHistoryDoc.id;
      // Crear un documento en la colección paymentHistory con el paymentAmount
      const paymentHistoryData = {
        paymentId: paymentId,
        profileId: newProfileId,
        membershipId: req.body.membershipId,
        gymId: req.body.gymId,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentStartDate: req.body.profileStartDate,
        paymentEndDate: req.body.profileEndDate,
        paymentType: 'new',
        paymentAmount: req.body.profileTotalReceive, // Establecer el paymentAmount obtenido del membership
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

const getAllProfiles = async (req, res) => {
  try {
    const gymId = req.query.gymId;

    // Continúa con tu lógica para obtener perfiles y realizar otras operaciones
    const offset = parseInt(req.query.offset) || 0;
    const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

    const getProfilesCollection = db.collection('profiles');

    // Agrega una cláusula where para filtrar por gymId
    const response = await getProfilesCollection
      .where('gymId', '==', gymId) // Filtrar perfiles por gymId
      .where('role', 'array-contains', 'member') // Verifica si el array contiene 'member'
      .limit(itemsPerPage)
      .offset(offset)
      .get();

    let profileArray = [];
    response.forEach((doc) => {
      const profile = new Profile(
        doc.data().profileId,

        doc.data().cardSerialNumber,
        doc.data().membershipId,
        doc.data().gymId,
        formatDate(doc.data().profileStartDate), // Formatear fecha de inicio
        formatDate(doc.data().profileEndDate), // Formatear fecha de fin
        formatDate(doc.data().profileRenewDate),
        doc.data().profileIsAdmin,
        doc.data().profileAdminLevel,
        doc.data().profileName,
        doc.data().profileLastname,
        doc.data().profileEmail,
        doc.data().profileBirthday,
        doc.data().profileTelephoneNumber,
        doc.data().profileFile,
        doc.data().profileFileWasUpload,
        doc.data().profilePicture,
        doc.data().profileStatus,
        doc.data().profilePostalCode,
        doc.data().profileAddress,
        doc.data().profileCity,
        doc.data().profileCountry,
        doc.data().profileFrozen,
        doc.data().profileFrozenDays,
        formatDate(doc.data().profileFrozenStartDate),
        formatDate(doc.data().profileUnFreezeStartDate),
        formatDate(doc.data().profileUnFreezeEndDate),
        doc.data().profileUnFrozen,
        doc.data().profileFileName,
        doc.data().notCheckOut,
        doc.data().wasCheckIn,
        doc.data().role,
        doc.data().profileGender,
        doc.data().profileLastMembershipPrice,
        doc.data().profileWasDiscount,
        doc.data().profileWasComplementary,
        doc.data().profileComplementaryReason,
        doc.data().profileDiscountType,
        doc.data().profileDiscountPercentage,
        doc.data().profileDiscountValue,
        doc.data().profileTotalReceive,
        doc.data().renewMembershipInQueue,
        doc.data().renewIsInQueue,
        doc.data().profileCoupleName,
        doc.data().profileCoupleEmail,
        doc.data().profileIsACouple,
        doc.data().permissions,
        doc.data().profileNotes
        // doc.data().profileFile,
      );

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

// const getAllProfiles = async (req, res) => {
//   try {
//     // Obtén los parámetros de consulta
//     const offset = parseInt(req.query.offset) || 0;
//     const itemsPerPage = parseInt(req.query.itemsPerPage) || 4;

//     const getProfilesCollection = db.collection('profiles');
//     const response = await getProfilesCollection
//       .limit(itemsPerPage)
//       .offset(offset)
//       .get();

//     let profileArray = [];
//     response.forEach((doc) => {
//       const profile = new Profile(
//         doc.profileId,
//         doc.data().profileName,
//         doc.data().profileLastName,
//         doc.data().profileEmail,
//         doc.data().profilePlan,
//         doc.data().profileStatus,
//         doc.data().profilePhoneNumber,
//         doc.data().profileImage,
//         doc.data().profileCode,
//         doc.data().profileSerialNumber,
//         doc.data().profileRole,
//         doc.data().profilePicture
//       );
//       profileArray.push(profile);
//     });
//     res.send(profileArray);
//   } catch (error) {
//     res.status(500).send(error);
//   }
// };
const getProfile = async (req, res) => {
  try {
    const getProfile = db.collection('profiles').doc(req.params.id);
    const response = await getProfile.get();

    // Formatea las fechas antes de enviar la respuesta
    const formattedProfileData = {
      ...response.data(),
      profileFrozenStartDate: formatDate(
        response.data().profileFrozenStartDate
      ),
      profileUnFreezeStartDate: formatDate(
        response.data().profileUnFreezeStartDate
      ),
      profileUnFreezeEndDate: formatDate(
        response.data().profileUnFreezeEndDate
      ),
      profileStartDate: formatDate(response.data().profileStartDate),
      profileEndDate: formatDate(response.data().profileEndDate),
    };

    res.send(formattedProfileData);
  } catch (error) {
    res.send(error);
  }
};

const getProfileByEmail = async (req, res) => {
  try {
    const partialEmail = req.body.email; // Obtén el correo electrónico parcial de la solicitud
    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    // Realiza una consulta a la colección 'profiles' filtrando por gymId y buscando perfiles que contengan el correo electrónico parcial
    const querySnapshot = await db
      .collection('profiles')
      .where('gymId', '==', gymId) // Filtrar por gymId
      .where('profileEmail', '>=', partialEmail)
      .where('profileEmail', '<=', partialEmail + '\uf8ff')
      .get();

    if (querySnapshot.empty) {
      // Si no se encuentra ningún perfil con el correo electrónico parcial, responde con un mensaje apropiado
      res.status(404).json({ message: 'Perfiles no encontrados' });
    } else {
      // Si se encuentran perfiles, obtén sus datos
      const profiles = [];
      querySnapshot.forEach((doc) => {
        profiles.push(doc.data());
      });

      res.json(profiles);
    }
  } catch (error) {
    console.error(
      'Error al buscar perfiles por correo electrónico parcial:',
      error
    );
    res.status(500).json({
      error: 'Error al buscar perfiles por correo electrónico parcial',
    });
  }
};

// const createProfile = async (req, res) => {
//   try {
//     const body = req.body;

//     // Assuming you want to generate a new document ID for each profile
//     const profilesCollection = db.collection('profiles');
//     const newProfileRef = profilesCollection.doc(); // Automatically generates a new document ID

//     await newProfileRef.set(body);

//     res.status(201).json({
//       message: 'Profile created',
//       associates: newProfileRef.id, // Return the newly generated profile ID
//     });
//   } catch (error) {
//     console.error('Error creating profile:', error);
//     res.status(500).json({
//       message: 'An error occurred while creating the profile',
//     });
//   }
// };

// const uploadFileToStorage = async (fileBuffer, fileName) => {
//   const file = bucket.file(`Files/${fileName}`);

//   // Upload the file to Cloud Storage
//   await file.save(fileBuffer, {
//     metadata: {
//       contentType: 'application/pdf', // Set the appropriate content type
//       // Add any additional metadata as needed
//     },
//   });

//   const fileUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
//   return fileUrl;
// };

const updateProfile = async (req, res) => {
  try {
    const { profileCode, formData } = req.body;

    const profileRef = admin
      .firestore()
      .collection('profiles')
      .doc(profileCode);

    // Obtén el perfil actual para verificar los roles existentes
    const currentProfile = await profileRef.get();

    // Obtiene los roles actuales del perfil
    let currentRoles = currentProfile.data().role || [];

    // Verifica si profileIsAdmin o profileIsTrainer son true en el formData
    const isAdmin = formData.profileIsAdmin === true;
    const isTrainer = formData.profileIsTrainer === true;

    // Elimina 'admin' del array de roles si isAdmin es false y está en el array
    if (!isAdmin && currentRoles.includes('admin')) {
      currentRoles = currentRoles.filter((role) => role !== 'admin');
    }

    // Elimina 'trainer' del array de roles si isTrainer es false y está en el array
    if (!isTrainer && currentRoles.includes('trainer')) {
      currentRoles = currentRoles.filter((role) => role !== 'trainer');
    }

    // Agrega 'admin' al array de roles si isAdmin es true y aún no está en el array
    if (isAdmin && !currentRoles.includes('admin')) {
      currentRoles.push('admin');
    }

    // Agrega 'trainer' al array de roles si isTrainer es true y aún no está en el array
    if (isTrainer && !currentRoles.includes('trainer')) {
      currentRoles.push('trainer');
    }

    // Si ni isAdmin ni isTrainer son true, y el array de roles está vacío, devuelve un error
    if (!isAdmin && !isTrainer && currentRoles.length === 0) {
      return res
        .status(400)
        .json({ error: 'Cannot leave a person without a role' });
    }

    // Actualiza el documento con los datos proporcionados en formData
    await profileRef.update({
      ...formData,
      role: currentRoles,
      profileIsAdmin: isAdmin,
      profileIsTrainer: isTrainer,
    });

    res.json({ message: 'Profile record updated successfully', formData });
  } catch (error) {
    console.error('Error updating profile:', error);
    res
      .status(500)
      .json({ error: 'Error updating profile', message: error.message });
  }
};

// const profileRef = admin
// .firestore()
// .collection('profiles')
// .doc(profileCode);

// await profileRef.update({ profileFile: fileUrl });

//    res.json({
//      message: 'Archivo cargado y perfil actualizado con éxito',
//      fileUrl,
//    });

const uploadFileToStorage = async (
  fileBuffer,
  fileName,
  contentType,
  profileCode
) => {
  const bucket = admin.storage().bucket(); // Obtén el bucket de almacenamiento

  const folderName = `Files/${profileCode}/`; // Carpeta personalizada para cada usuario
  const file = bucket.file(`${folderName}${fileName}`);

  // Upload the file to Cloud Storage
  await file.save(fileBuffer, {
    metadata: {
      contentType: contentType, // Establece el tipo de contenido adecuado
    },
  });

  return file; // Retornamos el objeto File para obtener la URL de descarga más adelante
};

const uploadFile = async (req, res) => {
  try {
    const { profileCode, profileFileName } = req.body;
    const file = req.file; // Aquí asumimos que el archivo se encuentra en el campo 'file' de la solicitud
    // Verifica si se adjuntó un archivo en la solicitud
    if (!file) {
      return res
        .status(400)
        .json({ error: 'No se ha proporcionado un archivo.' });
    }

    // Determina el tipo de contenido del archivo
    let contentType;

    if (file.mimetype === 'image/png') {
      contentType = 'image/png';
    } else if (file.mimetype === 'image/jpeg') {
      contentType = 'image/jpeg';
    } else if (file.mimetype === 'application/pdf') {
      contentType = 'application/pdf';
    } else {
      // Puedes manejar otros tipos de contenido aquí si es necesario
      return res.status(400).json({ error: 'Tipo de archivo no admitido.' });
    }

    // Luego, guarda el archivo en el almacenamiento en la nube y obtenemos el objeto File
    const uploadedFile = await uploadFileToStorage(
      file.buffer,
      file.originalname,
      contentType,
      profileCode // Pasamos el profileCode para crear la carpeta personalizada
    );

    // Obtén la URL de descarga del archivo
    const fileUrl = await uploadedFile.getSignedUrl({
      action: 'read',
      expires: '01-01-3000', // Define la fecha de caducidad de la URL
    });

    const profileRef = admin
      .firestore()
      .collection('profiles')
      .doc(profileCode);

    await profileRef.set(
      {
        profileFile: fileUrl,
        profileFileName: profileFileName,
        profileFileWasUpload: true,
      },
      { merge: true }
    );

    // Resto de tu lógica aquí...
  } catch (error) {
    console.error('Error al cargar el archivo:', error);
    res
      .status(500)
      .json({ error: 'Error al cargar el archivo', message: error.message });
  }
};

const deleteFile = async (req, res) => {
  try {
    const { profileCode, fileName } = req.query;

    // Verifica si se proporcionó profileCode y fileName
    if (!profileCode || !fileName) {
      return res
        .status(400)
        .json({ error: 'Se requieren profileCode y fileName.' });
    }

    const bucket = admin.storage().bucket();
    const folderName = `Files/${profileCode}/`;
    const file = bucket.file(`${folderName}${fileName}`);

    // Verifica si el archivo existe antes de intentar eliminarlo
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'El archivo no existe.' });
    }

    // Elimina el archivo
    await file.delete();
    const profileRef = admin
      .firestore()
      .collection('profiles')
      .doc(profileCode);

    const updateObj = {
      profileFile: admin.firestore.FieldValue.delete(),
      profileFileWasUpload: false,
    };

    // Actualiza el documento para eliminar el campo profileFile
    await profileRef.update(updateObj);

    // Resto de la lógica si es necesario, por ejemplo, actualizar la referencia en Firestore

    return res.status(200).json({ message: 'Archivo eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar el archivo:', error);
    return res
      .status(500)
      .json({ error: 'Error al eliminar el archivo', message: error.message });
  }
};

const freezeMembership = async (req, res) => {
  try {
    const { profileId, profileFrozen, profileFrozenStartDate, gymId } =
      req.body;

    // Verifica que el perfil exista y realice las validaciones necesarias

    const profileSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .get();

    // Obtiene el membershipId del documento del perfil
    const { membershipId } = profileSnapshot.data();

    // Actualiza los campos en el perfil seleccionado
    await db
      .collection('profiles')
      .doc(profileId)
      .update({
        profileFrozen: profileFrozen,
        profileFrozenStartDate: new Date().toISOString().slice(0, 10),
        profileStatus: false,
        profileUnFrozen: false,
      });

    const paymentHistoryRef = db.collection('paymentHistory');
    const newPaymentHistoryDoc = paymentHistoryRef.doc();
    const paymentId = newPaymentHistoryDoc.id;
    // Crear un documento en la colección paymentHistory con el paymentAmount
    const paymentHistoryData = {
      paymentId: paymentId,
      profileId: profileId,
      gymId: gymId,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentType: 'Freeze',
      paymentAmount: 0,
      membershipId: membershipId,
      // Establecer el paymentAmount obtenido del membership
      // ... (otros datos relacionados con el pago o historial)
    };

    await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

    // Responde con éxito
    res.status(200).json({ message: 'Membership frozen successfully' });
  } catch (error) {
    console.error('Error freezing membership:', error);
    res.status(500).json({ error: 'Error freezing membership' });
  }
};

const unfreezeMembership = async (req, res) => {
  try {
    const {
      gymId,
      profileId,
      profileUnFreezeDate,
      profileUnfreezeStartDate,
      profileUnFreezeFee,
      profileUnFreezeDays,
      profileFrozenReason,
      profileUnfreezeExpirationDate,
    } = req.body;

    const profileSnapshot = await db
      .collection('profiles')
      .doc(profileId)
      .get();
    // Obtiene el membershipId del documento del perfil
    const { membershipId } = profileSnapshot.data();

    // Actualiza los campos en el perfil seleccionado para descongelar la membresía y establece las fechas de descongelación
    await db.collection('profiles').doc(profileId).update({
      profileFrozen: false, // Establece profileFrozen en false para descongelar
      profileUnFreezeDate: profileUnFreezeDate, // Almacena profileUnFreezeStartDate
      profileUnFreezeFee: profileUnFreezeFee, // Almacena profileUnFreezeEndDate
      profileUnfreezeStartDate: profileUnfreezeStartDate,
      profileUnFreezeDays: profileUnFreezeDays,
      profileFrozenReason: profileFrozenReason,
      profileStatus: true,
      profileUnFrozen: true,
      profileEndDate: profileUnfreezeExpirationDate,
    });

    const paymentHistoryRef = db.collection('paymentHistory');
    const newPaymentHistoryDoc = paymentHistoryRef.doc();
    const paymentId = newPaymentHistoryDoc.id;
    // Crear un documento en la colección paymentHistory con el paymentAmount
    const paymentHistoryData = {
      paymentId: paymentId,
      profileId: profileId,
      gymId: gymId,
      profileNewExpirationDate: profileUnfreezeExpirationDate,
      paymentStartDate: profileUnfreezeStartDate,
      paymentDate: new Date().toISOString().slice(0, 10),
      paymentType: 'UnFreeze',
      paymentUnFreezeDays: profileUnFreezeDays,
      paymentFrozenReason: profileFrozenReason,
      paymentAmount: profileUnFreezeFee,
      membershipId: membershipId, // Establecer el paymentAmount obtenido del membership
      // ... (otros datos relacionados con el pago o historial)
    };

    await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

    // Responde con éxito
    res.status(200).json({ message: 'Membership unfrozen successfully' });
  } catch (error) {
    console.error('Error unfreezing membership:', error);
    res.status(500).json({ error: 'Error unfreezing membership' });
  }
};

const checkCardAvailability = async (req, res) => {
  const cardSerialNumber = req.body.cardSerialNumber;
  try {
    const cardRef = db.collection('cards').doc(cardSerialNumber);
    const cardDoc = await cardRef.get();

    if (!cardDoc.exists) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const cardData = cardDoc.data();

    if (cardData.cardStatus === 'inactive') {
      // El cardSerialNumber está inactivo, actualízalo a "active".
      await cardRef.update({ cardStatus: 'active' });
      return res.status(200).json({ message: 'Card updated to active' });
    } else if (cardData.cardStatus === 'active') {
      return res.status(403).json({ error: 'This Card is already in use' });
    }
  } catch (error) {
    console.error('Error checking card availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const checkCardForUpdated = async (req, res) => {
  const cardSerialNumber = req.body.cardSerialNumber;
  const profileId = req.body.profileCode;

  if (!cardSerialNumber) {
    return res.status(400).json({ error: 'Card serial number is required' });
  }
  try {
    const cardRef = db.collection('cards').doc(cardSerialNumber);
    const cardDoc = await cardRef.get();

    if (!cardDoc.exists) {
      return res.status(404).json({ error: 'Card not found' });
    }

    const cardData = cardDoc.data();

    const userRef = db.collection('profiles').doc(profileId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    const previousCardSerialNumber = userData.cardSerialNumber;

    if (cardData.cardStatus === 'active') {
      if (userData.cardSerialNumber === cardSerialNumber) {
        // El usuario está actualizando su perfil con el mismo cardSerialNumber, permite la actualización.
        return res.status(200).json({
          message: 'User is updating profile with the same cardSerialNumber',
        });
      } else {
        return res.status(404).json({ error: 'This Card is already in use' });
      }
    }

    if (previousCardSerialNumber) {
      const previousCardRef = db
        .collection('cards')
        .doc(previousCardSerialNumber);
      await previousCardRef.update({ cardStatus: 'inactive' });
    }
    // Si llegamos a este punto, la nueva tarjeta está disponible y podemos actualizar su estado.
    await cardRef.update({ cardStatus: 'active' });

    return res.status(200).json({ message: 'Card updated to active' });
  } catch (error) {
    console.error('Error checking card availability:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const updateProfileEndDate = async (req, res) => {
  const { profileId } = req.params;
  const { profilReneweData, gymId } = req.body;

  try {
    // Check if the profile already exists
    const profileRef = db.collection('profiles').doc(profileId);
    const profileDoc = await profileRef.get();

    if (!profileDoc.exists) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if the 'renewMembershipInQueue' object already exists in the profile
    const profileData = profileDoc.data();
    if (profileData?.renewMembershipInQueue?.renewIsInQueue) {
      return res
        .status(400)
        .json({ error: 'There is already a plan renewal in queue' });
    }

    // Create the 'renewMembershipInQueue' object
    const renewMembershipInQueue = {
      renewIsInQueue: true,
      membership: profilReneweData.currentSubscription,
      profileRenewStartDate: profilReneweData.profileRenewStartDate,
      profileRenewEndDate: profilReneweData.profileRenewEndDate,
      renewDate: new Date().toISOString().slice(0, 10),

      profileRenewLastMembershipPrice:
        profilReneweData.currentSubscription.price,
      profileRenewWasDiscount: profilReneweData.discountActivated,
      profileRenewWasComplementary: profilReneweData.complementaryActivated,
      profileRenewComplementaryReason: profilReneweData.complementaryReason,
      profileRenewDiscountType: profilReneweData.discountType,
      profileRenewDiscountPercentage: profilReneweData.discountPercentage,
      profileRenewDiscountValue: profilReneweData.discountValue,
      profileRenewTotalReceive: profilReneweData.totalReceive,
      profileRenewCoupleName: profilReneweData.profileRenewCoupleName,
      profileRenewCoupleEmail: profilReneweData.profileRenewCoupleEmail,
      profileRenewIsCouple: profilReneweData.profileRenewIsCouple,
    };

    // Store 'renewMembershipInQueue' in the user's profile
    await profileRef.set({ renewMembershipInQueue }, { merge: true });

    // const renewUpdatedInProfileCollection = {
    //   profileLastMembershipPrice: profilReneweData.currentSubscription.price,
    //   profileWasDiscount: profilReneweData.discountActivated,
    //   profileWasComplementary: profilReneweData.complementaryActivated,
    //   profileComplementaryReason: profilReneweData.complementaryReason,
    //   profileDiscountType: profilReneweData.discountType,
    //   profileDiscountPercentage: profilReneweData.discountPercentage,
    //   profileDiscountValue: profilReneweData.discountValue,
    //   profileTotalReceive: profilReneweData.totalReceive,
    // };
    // Verificar si se encontró el membership y obtener el precio
    // await profileRef.update(renewUpdatedInProfileCollection);

    const paymentHistoryRef = db.collection('paymentHistory');
    const newPaymentHistoryDoc = paymentHistoryRef.doc();
    const paymentId = newPaymentHistoryDoc.id;
    // Crear un documento en la colección paymentHistory con el paymentAmount
    const paymentHistoryData = {
      paymentId: paymentId,
      profileId: profileId,
      membershipId: profilReneweData.currentSubscription.value,
      gymId: gymId,
      paymentStartDate: profilReneweData.profileRenewStartDate,
      paymentEndDate: profilReneweData.profileRenewEndDate,
      paymentType: 'renew',
      paymentDate: new Date().toISOString().slice(0, 10),
      renewDate: new Date().toISOString().slice(0, 10),
      paymentAmount: profilReneweData.totalReceive, // Establecer el paymentAmount obtenido del membership
      // ... (otros datos relacionados con el pago o historial)
    };

    await paymentHistoryRef.doc(paymentId).set(paymentHistoryData);

    return res.status(200).json({
      message: 'Profile updated, and object added to the queue successfully',
    });
  } catch (error) {
    console.error('Error updating the profile:', error);
    return res.status(500).json({ error: 'Error updating the profile' });
  }
};
const getProfileByName = async (req, res) => {
  try {
    let partialName = req.body.name; // Obtén el término de búsqueda y elimina espacios adicionales
    partialName = partialName.charAt(0).toUpperCase() + partialName.slice(1);

    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    let profiles = [];

    const profilesRef = db.collection('profiles');

    // Verificar si el término de búsqueda contiene un espacio (suponiendo que es nombre y apellido)
    if (partialName.includes(' ')) {
      const [firstName, ...lastNameArr] = partialName.split(' ');
      const lastName = lastNameArr.join(' '); // Si el apellido tiene espacios

      const nameSnapshot = await profilesRef
        .where('gymId', '==', gymId) // Filtrar por gymId
        .where('role', 'array-contains', 'member')
        .where('profileName', '==', `${firstName} ${lastName}`)
        .get();

      nameSnapshot.forEach((doc) => {
        profiles.push(doc.data());
      });

      const lastNameSnapshot = await profilesRef
        .where('gymId', '==', gymId) // Filtrar por gymId
        .where('role', 'array-contains', 'member')
        .where('profileLastname', '==', lastName)
        .get();

      lastNameSnapshot.forEach((doc) => {
        profiles.push(doc.data());
      });
    } else {
      // Si no hay espacio, buscar coincidencias en profileName y profileLastName
      const snapshot = await profilesRef
        .where('gymId', '==', gymId) // Filtrar por gymId
        .where('role', 'array-contains', 'member')
        .where('profileName', '>=', partialName)
        .where('profileName', '<=', partialName + '\uf8ff')
        .get();

      snapshot.forEach((doc) => {
        profiles.push(doc.data());
      });
    }

    if (profiles.length === 0) {
      res.status(404).json({ message: 'Perfiles no encontrados' });
    } else {
      res.json(profiles);
    }
  } catch (error) {
    console.error('Error al buscar perfiles por término de búsqueda:', error);
    res.status(500).json({
      error: 'Error al buscar perfiles por término de búsqueda',
    });
  }
};
// const getProfileByName = async (req, res) => {
//   try {
//     let partialName = req.body.name; // Obtén el nombre parcial de la solicitud
//     partialName = partialName.charAt(0).toUpperCase() + partialName.slice(1);
//     const gymId = req.query.gymId; // Obtén el gymId de la solicitud

//     // Validar la entrada del usuario
//     if (!partialName || !gymId) {
//       return res.status(400).json({ error: 'Se requiere name y gymId.' });
//     }

//     // Realizar dos consultas separadas
//     const querySnapshotName = await db
//       .collection('profiles')
//       .where('gymId', '==', gymId)
//       .where('role', '==', 'member')
//       .where('profileName', '>=', partialName)
//       .where('profileName', '<=', partialName + '\uf8ff')
//       .get();

//     const querySnapshotLastName = await db
//       .collection('profiles')
//       .where('gymId', '==', gymId)
//       .where('role', '==', 'member')
//       .where('profileLastname', '>=', partialName)
//       .where('profileLastname', '<=', partialName + '\uf8ff')
//       .get();

//     // Combina los resultados de ambas consultas
//     const profiles = [
//       ...querySnapshotName.docs.map((doc) => doc.data()),
//       ...querySnapshotLastName.docs.map((doc) => doc.data()),
//     ];

//     return res.json({ data: profiles });
//   } catch (error) {
//     console.error('Error en getProfileByName:', error);
//     return res.status(500).json({ error: 'Error interno del servidor' });
//   }
// };

const searchByCardNumber = async (req, res) => {
  try {
    let searchTerm = req.query.term; // Obtén el término de búsqueda y elimina espacios adicionales
    searchTerm = searchTerm.trim().toUpperCase(); // Convierte a mayúsculas y elimina espacios al principio y al final

    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    const profilesRef = db.collection('profiles');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId) // Filtrar por gymId
      .where('role', 'array-contains', 'member')
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

const searchKnownMemberByCardNumber = async (req, res) => {
  try {
    let searchTerm = req.query.term; // Obtén el término de búsqueda y elimina espacios adicionales
    searchTerm = searchTerm.trim().toUpperCase(); // Convierte a mayúsculas y elimina espacios al principio y al final

    const gymId = req.query.gymId; // Obtén el gymId de la solicitud

    const profilesRef = db.collection('profiles');

    const snapshot = await profilesRef
      .where('gymId', '==', gymId) // Filtrar por gymId
      .where('role', 'array-contains', 'unknownMember')
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

const searchProfile = async (req, res) => {
  try {
    let searchTerm = req.query.term; // Obtén el término de búsqueda y elimina espacios adicionales
    searchTerm = searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1);

    const gymId = req.query.gymId;

    let profiles = [];

    const profilesRef = db.collection('profiles');

    if (searchTerm.includes(' ')) {
      const [firstName, ...lastNameArr] = searchTerm.split(' ');
      const lastName = lastNameArr.join(' ');

      const nameSnapshot = await profilesRef
        .where('gymId', '==', gymId)
        .where('role', 'array-contains', 'member')
        .where('profileName', '==', `${firstName} ${lastName}`)
        .get();

      nameSnapshot.forEach((doc) => {
        profiles.push(doc.data());
      });

      const lastNameSnapshot = await profilesRef
        .where('gymId', '==', gymId)
        .where('role', 'array-contains', 'member')
        .where('profileLastname', '==', lastName)
        .get();

      lastNameSnapshot.forEach((doc) => {
        profiles.push(doc.data());
      });
    } else {
      const snapshot = await profilesRef
        .where('gymId', '==', gymId)
        .where('role', 'array-contains', 'member')
        .where('profileName', '>=', searchTerm)
        .where('profileName', '<=', searchTerm + '\uf8ff')
        .get();

      snapshot.forEach((doc) => {
        profiles.push(doc.data());
      });
    }

    if (profiles.length === 0) {
      res.status(404).json({ message: 'Perfiles no encontrados' });
    } else {
      res.json(profiles);
    }
  } catch (error) {
    console.error('Error al buscar perfiles por término de búsqueda:', error);
    res.status(500).json({
      error: 'Error al buscar perfiles por término de búsqueda',
    });
  }
};

const getCardDetail = async (req, res) => {
  try {
    const cardSerialNumber = req.params.cardNumber; // Obtén el número de tarjeta de los parámetros de la solicitud
    const profilesRef = db.collection('cards');

    // Realiza la consulta para obtener el perfil con el cardSerialNumber y el unknownMemberStatus igual a 'active'
    const querySnapshot = await profilesRef
      .where('cardSerialNumber', '==', cardSerialNumber)
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

module.exports = {
  getAllProfiles,
  getProfile,
  getCardDetail,
  searchProfile,
  createProfile,
  updateProfile,
  uploadFile,
  deleteFile,
  freezeMembership,
  unfreezeMembership,
  checkCardAvailability,
  checkCardForUpdated,
  updateProfileEndDate,
  getProfileByEmail,
  getProfileByName,
  searchByCardNumber,
  searchKnownMemberByCardNumber,
};
