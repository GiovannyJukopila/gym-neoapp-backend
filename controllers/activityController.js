const { db } = require('../firebase');
const { ACTIVITY_COLLECTION } = require('../utils/activityLog');

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// El equipo de NeoApp puede mirar otro gimnasio; el resto, solo el suyo
const gymFor = (staff, requestedGym) =>
  staff.isNeoApp && typeof requestedGym === 'string' && requestedGym
    ? requestedGym
    : staff.gymId;

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
 * Coste: una lectura por entrada devuelta (+1 por el cursor).
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

    if (cursor) {
      const cursorDoc = await db
        .collection(ACTIVITY_COLLECTION)
        .doc(String(cursor))
        .get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.limit(limit + 1).get();
    const docs = snapshot.docs.slice(0, limit);

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
      nextCursor:
        snapshot.docs.length > limit ? docs[docs.length - 1].id : null,
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

    const staff = new Map();
    [...admins.docs, ...trainers.docs].forEach((doc) => {
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
