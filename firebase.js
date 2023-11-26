const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const serviceAccount = require('./cred.json');
const {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} = require('@firebase/storage');

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: 'https://qr-test-399de-default-rtdb.firebaseio.com',
  storageBucket: 'qr-test-399de.appspot.com',
});

const db = getFirestore();
const storage = admin.storage();
const bucket = storage.bucket();

module.exports = {
  db,
  storage, // Exporta solo la variable storage de esta manera
  bucket,
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
};
