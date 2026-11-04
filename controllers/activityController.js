const { db } = require('../firebase');
const { ACTIVITY_COLLECTION } = require('../utils/activityLog');

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// El equipo de NeoApp puede mirar otro gimnasio; el resto, solo el suyo
const gymFor = (staff, requestedGym) =>
  staff.isNeoApp && typeof requestedGym === 'string' && requestedGym
    ? requestedGym
    : staff.gymId;

// ---- Equipo NeoApp: su actividad no la ve nadie ----
// Ya no se registra (utils/activityEntry.js); esto oculta las entradas que se
// guardaron antes

const NEOAPP_CACHE_MS = 10 * 60 * 1000;
let neoAppCache = { ids: new Set(), loadedAt: 0 };

// 2 consultas pequeñas cada 10 min
const neoAppProfileIds = async () => {
  if (Date.now() - neoAppCache.loadedAt < NEOAPP_CACHE_MS) {
    return neoAppCache.ids;
  }
  try {
    const [byLevel, byRole] = await Promise.all([
      db
        .collection('profiles')
        .where('profileAdminLevel', 'in', [3, 4, '3', '4'])
        .select()
        .get(),
      db
        .collection('profiles')
        .where('role', 'array-contains-any', ['masteradmin', 'superadmin'])
        .select()
        .get(),
    ]);
    neoAppCache = {
      ids: new Set([...byLevel.docs, ...byRole.docs].map((doc) => doc.id)),
      loadedAt: Date.now(),
    };
  } catch (error) {
    console.error('[activity] Could not load NeoApp team:', error.message);
  }
  return neoAppCache.ids;
};

const isNeoAppEntry = (data, neoAppIds) => neoAppIds.has(data.actor?.profileId);

// Si se ocultan entradas, se sigue leyendo hasta llenar la pagina
const MAX_ROUNDS = 5;

const toIso = (value) =>
  typeof value?.toDate === 'function' ? value.toDate().toISOString() : '';

/**
 * GET /api/activity
 *   actorId    una persona concreta
 *   actorType  'staff' | 'member' | 'system' | 'device'
 *   category   'members', 'classes', ...
 *   targetId   todo lo relacionado con un socio, clase, pago...
 *   (los filtros se pueden combinar)
 *   from, to                     ISO; to es exclusivo
 *   cursor                       id de la ultima entrada de la pagina anterior
 *   limit                        30 por defecto
 *
 * Coste: una lectura por entrada leida (+1 por el cursor). Se saltan las
 * entradas antiguas del equipo NeoApp.
 */
const getActivity = async (req, res) => {
  try {
    const { actorId, actorType, category, targetId, from, to, cursor } =
      req.query;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );

    let query = db
      .collection(ACTIVITY_COLLECTION)
      .where('gymId', '==', gymFor(req.staff, req.query.gymId));

    if (actorId) query = query.where('actor.profileId', '==', actorId);
    else if (actorType) query = query.where('actor.type', '==', actorType);
    if (category) query = query.where('category', '==', category);
    if (targetId) {
      query = query.where('targetIds', 'array-contains', String(targetId));
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && !isNaN(fromDate)) query = query.where('at', '>=', fromDate);
    if (toDate && !isNaN(toDate)) query = query.where('at', '<', toDate);

    query = query.orderBy('at', 'desc');

    // Lo que hizo el equipo NeoApp no se enseña
    const neoAppIds = await neoAppProfileIds();
    if (actorId && neoAppIds.has(String(actorId))) {
      return res.json({ items: [], nextCursor: null });
    }

    let last = null;
    if (cursor) {
      const cursorDoc = await db
        .collection(ACTIVITY_COLLECTION)
        .doc(String(cursor))
        .get();
      if (cursorDoc.exists) last = cursorDoc;
    }

    const docs = [];
    let nextCursor = null;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const page = last ? query.startAfter(last) : query;
      const snapshot = await page.limit(limit + 1).get();

      for (const doc of snapshot.docs) {
        if (docs.length === limit) {
          // Queda al menos otra entrada: hay pagina siguiente
          nextCursor = last.id;
          break;
        }
        last = doc;
        if (!isNeoAppEntry(doc.data(), neoAppIds)) docs.push(doc);
      }
      if (nextCursor || snapshot.docs.length <= limit) break;
      // Ronda llena de entradas ocultas: si es la ultima, se sigue en otra pagina
      if (round === MAX_ROUNDS - 1) nextCursor = last.id;
    }

    res.json({
      items: docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          at: toIso(data.at),
          actor: data.actor,
          action: data.action,
          category: data.category,
          summary: data.summary,
          target: data.target,
          documents: data.documents || [],
          details: data.details || [],
        };
      }),
      nextCursor,
    });
  } catch (error) {
    // Falta un indice compuesto: Firestore indica en el mensaje como crearlo
    if (error.code === 9 || /index/i.test(error.message)) {
      console.error('[activity] Missing Firestore index:', error.message);
      return res.status(500).json({
        error: 'This filter is not ready yet. Please try again later.',
      });
    }
    console.error('Error getting activity:', error);
    res.status(500).json({ error: 'Error getting activity' });
  }
};

/**
 * GET /api/activity/staff
 * Personal del gimnasio para el filtro "quien" (admins y trainers).
 */
const getActivityStaff = async (req, res) => {
  try {
    const gymId = gymFor(req.staff, req.query.gymId);
    const [admins, trainers] = await Promise.all([
      db
        .collection('profiles')
        .where('gymId', '==', gymId)
        .where('profileIsAdmin', '==', true)
        .select('profileName', 'profileLastname', 'profileAdminLevel', 'role')
        .get(),
      db
        .collection('profiles')
        .where('gymId', '==', gymId)
        .where('role', 'array-contains', 'trainer')
        .select('profileName', 'profileLastname', 'profileAdminLevel', 'role')
        .get(),
    ]);

    const neoAppIds = await neoAppProfileIds();
    const staff = new Map();
    [...admins.docs, ...trainers.docs].forEach((doc) => {
      if (neoAppIds.has(doc.id)) return;
      const data = doc.data();
      staff.set(doc.id, {
        profileId: doc.id,
        name: [data.profileName, data.profileLastname].filter(Boolean).join(' '),
        role: Array.isArray(data.role) && data.role.includes('admin')
          ? 'Admin'
          : 'Trainer',
      });
    });

    res.json(
      [...staff.values()].sort((a, b) => a.name.localeCompare(b.name))
    );
  } catch (error) {
    console.error('Error getting staff:', error);
    res.status(500).json({ error: 'Error getting staff' });
  }
};

module.exports = { getActivity, getActivityStaff };
