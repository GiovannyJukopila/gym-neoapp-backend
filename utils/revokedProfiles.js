/**
 * Perfiles cuya sesion ya no vale (admins eliminados).
 *
 * Los tokens de sesion no caducan, asi que borrar a un admin no basta: su
 * navegador seguiria teniendo un token valido. Esta lista se guarda en un
 * unico documento (metadata/revokedProfiles) y se tiene en memoria; se relee
 * como mucho cada 10 minutos (1 lectura), por si hay varios servidores.
 *
 * Si no se puede leer, no se bloquea a nadie: un fallo aqui no puede dejar a
 * todo el gimnasio sin panel.
 */
const admin = require('firebase-admin');
const { db } = require('../firebase');

const REFRESH_MS = 10 * 60 * 1000;
const revokedRef = () => db.collection('metadata').doc('revokedProfiles');

let revoked = new Set();
let loadedAt = 0;
let loading = null;

const refresh = () => {
  if (loading) return loading;
  loading = revokedRef()
    .get()
    .then((snapshot) => {
      revoked = new Set(snapshot.exists ? snapshot.data().ids || [] : []);
      loadedAt = Date.now();
    })
    .catch((error) => {
      console.error('[revokedProfiles] Could not load:', error.message);
    })
    .finally(() => {
      loading = null;
    });
  return loading;
};

// Sincrono: usa lo que hay en memoria y refresca en segundo plano
const isRevoked = (profileId) => {
  if (Date.now() - loadedAt > REFRESH_MS) refresh();
  return !!profileId && revoked.has(profileId);
};

const revokeProfile = async (profileId) => {
  revoked.add(profileId);
  await revokedRef().set(
    { ids: admin.firestore.FieldValue.arrayUnion(profileId) },
    { merge: true }
  );
};

// Se carga al arrancar el servidor
refresh();

module.exports = { isRevoked, revokeProfile, refreshRevokedProfiles: refresh };
