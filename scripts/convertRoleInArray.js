const { db } = require('../firebase');
const admin = require('firebase-admin');
const profilesCollection = admin.firestore().collection('profiles');
const gymIdToMigrate = 'gym-test';

async function migrateRoles() {
  const profilesSnapshot = await profilesCollection
    .where('gymId', '==', gymIdToMigrate)
    .get();

  profilesSnapshot.forEach(async (doc) => {
    const currentRole = doc.data().role;
    const updatedRole = Array.isArray(currentRole)
      ? currentRole
      : [currentRole].filter(Boolean); // Filtrar valores nulos o indefinidos

    await profilesCollection.doc(doc.id).update({ role: updatedRole });
  });

  console.log(
    'Migración completada para los perfiles con gymId:',
    gymIdToMigrate
  );
}

migrateRoles();
