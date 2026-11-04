/**
 * Convierte lo capturado en una peticion (utils/activityCapture.js) en
 * entradas de actividad legibles (utils/activityLog.js).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../firebase');
const {
  recordActivity,
  appendToActivity,
  resolveTargetName,
} = require('./activityLog');
const { describeCollection, diffDocuments } = require('./activityDiff');
const { runWithContext, currentContext } = require('./activityCapture');
const { isRevoked } = require('./revokedProfiles');

const DOCS_PER_ENTRY = 10;

// ---- Quien hizo la accion ----

const ACTOR_CACHE_MS = 10 * 60 * 1000;
const actorCache = new Map();

const isStaffProfile = (profile) =>
  profile.profileIsAdmin === true ||
  (Array.isArray(profile.role) &&
    profile.role.some((role) =>
      ['admin', 'trainer', 'masteradmin', 'superadmin'].includes(role)
    ));

// Cualquier persona con sesion: staff o socio (1 lectura cada 10 min)
const loadActor = async (profileId) => {
  if (!profileId || isRevoked(profileId)) return null;
  const cached = actorCache.get(profileId);
  if (cached && Date.now() - cached.loadedAt < ACTOR_CACHE_MS) {
    return cached.actor;
  }
  try {
    const snapshot = await db.collection('profiles').doc(profileId).get();
    const profile = snapshot.exists ? snapshot.data() : null;
    const actor = profile
      ? {
          type: isStaffProfile(profile) ? 'staff' : 'member',
          profileId,
          name:
            [profile.profileName, profile.profileLastname]
              .filter(Boolean)
              .join(' ') || profileId,
          gymId: profile.gymId || '',
          isNeoApp:
            Number(profile.profileAdminLevel) >= 3 ||
            (Array.isArray(profile.role) &&
              profile.role.some((role) =>
                ['masteradmin', 'superadmin'].includes(role)
              )),
        }
      : null;
    actorCache.set(profileId, { actor, loadedAt: Date.now() });
    return actor;
  } catch (error) {
    return null;
  }
};

const tokenProfileId = (req) => {
  const authHeader = req.headers?.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return '';
  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)?.profileId || '';
  } catch (error) {
    return '';
  }
};

// Sin sesion: se nombra por donde llego (escaner, formulario...)
const deviceActor = (path) => ({
  type: 'device',
  profileId: '',
  name: path.startsWith('/scan')
    ? 'Check-in scanner'
    : path.startsWith('/auth')
    ? 'Sign-in / sign-up page'
    : 'Not signed in',
});

const resolveRequestActor = async (ctx) => {
  const fromResponse = ctx.match?.entry.actor?.(ctx.info);
  if (fromResponse) return (await loadActor(fromResponse)) || deviceActor(ctx.path);
  const profileId = tokenProfileId(ctx.req);
  return (profileId && (await loadActor(profileId))) || deviceActor(ctx.path);
};

// ---- Documentos tocados ----

// Varias escrituras al mismo documento: primer "antes" y ultimo "despues"
const groupChanges = (changes) => {
  const byPath = new Map();
  changes.forEach((change) => {
    const current = byPath.get(change.path);
    if (!current) {
      byPath.set(change.path, { ...change });
    } else {
      current.after = change.after;
      current.type = change.type;
    }
  });
  return [...byPath.values()];
};

const toDocuments = (changes) =>
  groupChanges(changes)
    .map((change) => {
      const data = change.after || change.before || {};
      const meta = describeCollection(change.collection, data);
      const op = !change.after
        ? 'deleted'
        : change.beforeKnown && !change.before
        ? 'created'
        : 'updated';
      return {
        collection: change.collection,
        id: change.id,
        parentCollection: change.parentCollection,
        parentId: change.parentId,
        op,
        category: meta.category,
        entity: meta.entity,
        name: meta.name,
        gymId: data.gymId || '',
        data,
        fields: diffDocuments(change.collection, change.before, change.after),
      };
    })
    // Un "guardar" que no cambia nada no es actividad
    .filter((doc) => doc.op !== 'updated' || doc.fields.length);

// Campos que apuntan a otra cosa: en vez del id se guarda su nombre
// (el id sigue en targetIds para poder buscar)
const REFERENCE_TYPES = {
  profileId: 'profile',
  memberId: 'profile',
  memberProfileId: 'profile',
  nonMemberProfileId: 'profile',
  selectTrainer: 'profile',
  membershipId: 'plan',
  classId: 'class',
  primaryClassId: 'primaryClass',
  courtId: 'court',
  guestId: 'guest',
};

const ENTITY_SOURCE_TYPES = {
  profiles: 'profile',
  memberships: 'plan',
  classes: 'class',
  primaryClasses: 'primaryClass',
  courts: 'court',
  guests: 'guest',
};

const resolveReferences = async (documents) => {
  // Lo tocado en la misma peticion ya tiene nombre (sin lecturas)
  const known = new Map();
  documents.forEach((doc) => {
    const type = ENTITY_SOURCE_TYPES[doc.collection];
    if (type && doc.name) known.set(`${type}:${doc.id}`, doc.name);
  });

  const nameOf = async (type, id) => {
    if (!id) return '';
    const key = `${type}:${id}`;
    if (!known.has(key)) known.set(key, await resolveTargetName(type, id));
    return known.get(key) || id;
  };

  for (const doc of documents) {
    for (const field of doc.fields) {
      const key = field.field.split('.').pop();
      const type = REFERENCE_TYPES[key];
      // El propio id del documento no se traduce (es lo que es)
      if (!type || field.after === doc.id || field.before === doc.id) continue;
      field.before = await nameOf(type, field.before);
      field.after = await nameOf(type, field.after);
    }
  }
  return documents;
};

// Ids relacionados dentro de los datos (para buscar "todo lo de Boris")
const RELATED_KEYS = [
  'profileId',
  'memberId',
  'memberProfileId',
  'nonMemberProfileId',
  'deletedProfileId',
  'selectTrainer',
  'classId',
  'activityId',
  'paymentId',
  'membershipId',
  'cardSerialNumber',
];

const relatedIds = (documents) =>
  documents.flatMap((doc) => [
    doc.id,
    doc.parentId,
    ...RELATED_KEYS.map((key) => doc.data?.[key]).filter(
      (value) => typeof value === 'string' && value
    ),
  ]);

const VERBS = { created: 'created', updated: 'updated', deleted: 'deleted' };

const PARENT_TYPES = {
  profiles: 'profile',
  classes: 'class',
  primaryClasses: 'primaryClass',
  courts: 'court',
};

const ENTITY_TYPES = {
  member: 'profile',
  admin: 'profile',
  trainer: 'profile',
  'non-member': 'profile',
  class: 'class',
  'recurring class': 'primaryClass',
  plan: 'plan',
  court: 'court',
  guest: 'guest',
};

/**
 * Construye y guarda las entradas de una peticion o proceso.
 * @param ctx contexto de actividad (con changes)
 * @param actor quien lo hizo
 * @param info { params, body, query, response } para el catalogo
 */
const writeEntries = async (ctx, actor, info = {}, options = {}) => {
  const changes = ctx.changes.splice(0);
  // El equipo NeoApp (desarrollo y soporte) no aparece en la actividad
  if (actor?.isNeoApp) return null;
  const documents = await resolveReferences(toDocuments(changes));
  const catalog = ctx.match?.entry;

  if (!documents.length) {
    // Sin cambios de datos solo se registran acciones del catalogo que no
    // escriben (informes, emails, login...) y que no pretendian escribir
    if (!catalog || catalog.requiresChanges || changes.length) return;
  }

  const safe = (fn, fallback) => {
    try {
      return fn ? fn(info) ?? fallback : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const primary = documents[0];
  let target = catalog ? safe(catalog.target, null) : null;
  if (target && !target.name) {
    const touched = documents.find((doc) => doc.id === target.id);
    target.name =
      touched?.name ||
      info.resolvedTargetName ||
      (await resolveTargetName(target.type, target.id));
  }
  if (!target && primary?.parentId) {
    // Algo dentro de una clase o de un socio: lo principal es la clase o el socio
    const type = PARENT_TYPES[primary.parentCollection] || primary.parentCollection;
    target = {
      type,
      id: primary.parentId,
      name:
        documents.find((doc) => doc.id === primary.parentId)?.name ||
        (await resolveTargetName(type, primary.parentId)) ||
        primary.parentId,
    };
  }
  if (!target && primary) {
    target = {
      type: ENTITY_TYPES[primary.entity] || primary.collection,
      id: primary.id,
      name: primary.name || primary.entity,
    };
  }

  const action =
    catalog?.action ||
    (primary ? `${primary.entity.replace(/\s+/g, '-')}.${primary.op}` : '');
  const summary =
    catalog?.summary || (primary ? `${VERBS[primary.op]} the ${primary.entity}` : '');
  const category = catalog?.category || primary?.category || 'other';

  // Staff de un gimnasio: siempre su gimnasio. Resto: el de los datos
  const requestedGym =
    info.params?.gymId || info.body?.gymId || info.query?.gymId || '';
  const gymId =
    actor.type === 'staff' && !actor.isNeoApp
      ? actor.gymId
      : primary?.gymId ||
        (typeof requestedGym === 'string' ? requestedGym : '') ||
        actor.gymId ||
        '';

  // Detalles que apuntan a un socio: se muestra su nombre
  const details = await Promise.all(
    safe(catalog?.details, []).map(async (detail) =>
      detail.profileId
        ? {
            label: detail.label,
            value:
              documents.find((doc) => doc.id === detail.profileId)?.name ||
              (await resolveTargetName('profile', detail.profileId)) ||
              detail.value,
          }
        : detail
    )
  );
  if (info.failedStatus) {
    details.push({
      label: 'Result',
      value: `The action failed (error ${info.failedStatus}) after changing data`,
    });
  }
  const targetIds = [target?.id, ...relatedIds(documents)].filter(Boolean);
  const requestId = crypto.randomUUID();

  // Procesos masivos (p. ej. el diario): una entrada por documento, para
  // poder buscar "que le paso a Boris". Si no, se parte en bloques
  const cleanDocuments = (list) =>
    list.map(
      ({ data, gymId: _gym, category: _cat, parentCollection, parentId, ...doc }) =>
        doc
    );

  // Escrituras tardias de la misma peticion: van a la entrada que ya existe
  const previous = options.appendTo;
  if (
    previous?.id &&
    documents.length &&
    previous.documents + documents.length <= DOCS_PER_ENTRY
  ) {
    const appended = await appendToActivity(previous.id, {
      documents: cleanDocuments(documents),
      targetIds: relatedIds(documents),
    });
    if (appended) {
      previous.documents += documents.length;
      return previous;
    }
  }

  const perDocument = options.perDocument || catalog?.perDocument;
  // La entrada escrita (si es una sola), para añadirle escrituras tardias
  let written = null;
  const size = perDocument ? 1 : DOCS_PER_ENTRY;
  const parts = [];
  for (let i = 0; i < Math.max(documents.length, 1); i += size) {
    parts.push(documents.slice(i, i + size));
  }

  for (const [index, part] of parts.entries()) {
    const partTarget =
      parts.length > 1 && part[0]
        ? {
            type: ENTITY_TYPES[part[0].entity] || part[0].collection,
            id: part[0].id,
            name: part[0].name || part[0].entity,
          }
        : target;
    const partSummary = perDocument
      ? catalog?.docSummary ||
        (part[0] ? `${VERBS[part[0].op]} the ${part[0].entity}` : summary)
      : parts.length > 1
      ? `${summary} (part ${index + 1} of ${parts.length})`
      : summary;
    const id = await recordActivity({
      gymId,
      requestId,
      actor,
      action,
      category,
      summary: partSummary,
      target: partTarget,
      targetIds:
        parts.length > 1
          ? [partTarget?.id, ...relatedIds(part)].filter(Boolean)
          : targetIds,
      documents: cleanDocuments(part),
      details,
    });
    if (parts.length === 1) written = { id, documents: part.length };
  }
  return written;
};

// ---- Procesos automaticos (cron) ----

const SYSTEM_ACTOR = {
  type: 'system',
  profileId: '',
  name: 'NeoApp (automatic)',
};

/**
 * Ejecuta un proceso automatico registrando lo que cambie.
 * @param match { entry } del catalogo para describirlo (opcional)
 */
const runSystemTask = (entry, fn) =>
  runWithContext({ source: 'system', match: entry ? { entry } : null }, async () => {
    const ctx = currentContext();
    try {
      return await fn();
    } finally {
      await writeEntries(ctx, SYSTEM_ACTOR, {}, { perDocument: true }).catch(
        (error) =>
          console.error('[activity] Could not record system task:', error.message)
      );
    }
  });

module.exports = {
  writeEntries,
  resolveRequestActor,
  runSystemTask,
  toDocuments,
};
