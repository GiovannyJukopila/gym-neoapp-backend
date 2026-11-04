/**
 * Registro de actividad: quien hizo que, a quien, cuando y con que datos.
 *
 * Cada entrada es un documento de 'staffActivity':
 *
 *   gymId      gimnasio donde ocurrio (para filtrar)
 *   at         hora del servidor
 *   expireAt   cuando se borra sola (politica TTL de Firestore, 1 año)
 *   requestId  agrupa las entradas de una misma accion si se parte en varias
 *   actor      { type, profileId, name }
 *                type: 'staff' | 'member' | 'system' | 'device'
 *   action     'member.updated', 'class.booked', ...
 *   category   'members', 'classes', 'finance', ...
 *   summary    frase: "<actor> <summary> <target>"
 *   target     { type, id, name }  lo principal afectado
 *   targetIds  todo lo afectado (socios, clases, pagos...) para buscar
 *   documents  [{ collection, id, op, entity, name,
 *                 fields: [{ field, label, before, after }] }]
 *   details    [{ label, value }]  datos de contexto (plan, importe...)
 *
 * Solo se añaden entradas: no hay forma de editarlas ni borrarlas desde la
 * app. Lo que hace el equipo NeoApp (desarrollo y soporte) no se registra. Escribir el registro nunca hace fallar la accion del usuario.
 */
const admin = require('firebase-admin');
const { db } = require('../firebase');

const ACTIVITY_COLLECTION = 'staffActivity';
const RETENTION_DAYS = 365;

const text = (value, max = 200) => {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : String(value);
  return str.trim().slice(0, max);
};

const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

const buildEntry = (entry) => ({
  gymId: text(entry.gymId, 80),
  at: admin.firestore.FieldValue.serverTimestamp(),
  expireAt: admin.firestore.Timestamp.fromMillis(
    Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000
  ),
  requestId: text(entry.requestId, 60),
  actor: {
    type: text(entry.actor?.type, 20),
    profileId: text(entry.actor?.profileId, 80),
    name: text(entry.actor?.name, 120),
  },
  action: text(entry.action, 60),
  category: text(entry.category, 40),
  summary: text(entry.summary),
  target: entry.target
    ? {
        type: text(entry.target.type, 40),
        id: text(entry.target.id, 120),
        name: text(entry.target.name, 160),
      }
    : null,
  targetIds: [...new Set(list(entry.targetIds, 60).map((id) => text(id, 120)))]
    .filter(Boolean)
    .slice(0, 40),
  documents: list(entry.documents, 10).map((doc) => ({
    collection: text(doc.collection, 60),
    id: text(doc.id, 120),
    op: text(doc.op, 20),
    entity: text(doc.entity, 40),
    name: text(doc.name, 160),
    fields: list(doc.fields, 80).map((field) => ({
      field: text(field.field, 120),
      label: text(field.label, 120),
      before: text(field.before),
      after: text(field.after),
    })),
  })),
  details: list(entry.details, 20).map((detail) => ({
    label: text(detail.label, 80),
    value: text(detail.value),
  })),
});

// @returns el id de la entrada, o null si no se guardo
const recordActivity = async (entry) => {
  try {
    if (!entry.gymId || !entry.action) return null;
    const ref = await db.collection(ACTIVITY_COLLECTION).add(buildEntry(entry));
    return ref.id;
  } catch (error) {
    console.error('[activity] Could not record activity:', error.message);
    return null;
  }
};

// Documentos que se escribieron despues de responder: se añaden a su entrada
const appendToActivity = async (id, { documents, targetIds }) => {
  try {
    const { documents: docs, targetIds: ids } = buildEntry({
      documents,
      targetIds,
    });
    const update = {
      documents: admin.firestore.FieldValue.arrayUnion(...docs),
    };
    if (ids.length) {
      update.targetIds = admin.firestore.FieldValue.arrayUnion(...ids);
    }
    await db.collection(ACTIVITY_COLLECTION).doc(id).update(update);
    return true;
  } catch (error) {
    console.error('[activity] Could not update activity:', error.message);
    return false;
  }
};

// ---- Nombre de algo que no se ha tocado en la peticion (1 lectura, 10 min) ----

const NAME_CACHE_MS = 10 * 60 * 1000;
const nameCache = new Map();

const TARGET_SOURCES = {
  profile: {
    collection: 'profiles',
    name: (d) => [d.profileName, d.profileLastname].filter(Boolean).join(' '),
  },
  plan: { collection: 'memberships', name: (d) => d.planName },
  class: { collection: 'classes', name: (d) => d.className },
  primaryClass: { collection: 'primaryClasses', name: (d) => d.className },
  court: { collection: 'courts', name: (d) => d.courtName },
  guest: {
    collection: 'guests',
    name: (d) => [d.name, d.lastname].filter(Boolean).join(' '),
  },
};

const resolveTargetName = async (type, id) => {
  const source = TARGET_SOURCES[type];
  if (!source || !id || typeof id !== 'string') return '';

  const key = `${type}:${id}`;
  const cached = nameCache.get(key);
  if (cached && Date.now() - cached.loadedAt < NAME_CACHE_MS) {
    return cached.name;
  }

  try {
    const snapshot = await db.collection(source.collection).doc(id).get();
    const name = snapshot.exists ? text(source.name(snapshot.data())) : '';
    nameCache.set(key, { name, loadedAt: Date.now() });
    return name;
  } catch (error) {
    return '';
  }
};

module.exports = {
  ACTIVITY_COLLECTION,
  recordActivity,
  appendToActivity,
  resolveTargetName,
};
