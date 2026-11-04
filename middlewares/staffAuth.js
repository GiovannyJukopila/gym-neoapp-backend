const jwt = require('jsonwebtoken');
const { db } = require('../firebase');
const { isRevoked } = require('../utils/revokedProfiles');

/**
 * Solo el personal del gimnasio (quien puede entrar al panel) puede cambiar
 * socios. Ademas deja en req.staff quien hace el cambio, sacado del token de
 * sesion (no de lo que diga el panel), para registrarlo en el perfil.
 *
 * allowMissingToken: los paneles antiguos que siguen abiertos en recepcion no
 * envian el token en algunas llamadas (renovar, congelar, descongelar). Se
 * dejan pasar mientras se actualizan; con REQUIRE_STAFF_TOKEN=true en el .env
 * se exige siempre. Un token invalido o de alguien que no es staff se rechaza
 * siempre.
 */

const CACHE_MS = 10 * 60 * 1000;
const staffCache = new Map();

// Mismo criterio que el login del panel
const isStaff = (profile) =>
  profile.profileIsAdmin === true ||
  (Array.isArray(profile.role) && profile.role.includes('trainer'));

const NEOAPP_ROLES = ['masteradmin', 'superadmin'];

// Una lectura por persona cada 10 minutos como mucho
const loadStaff = async (profileId) => {
  const cached = staffCache.get(profileId);
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) return cached.staff;

  const snapshot = await db.collection('profiles').doc(profileId).get();
  const profile = snapshot.exists ? snapshot.data() : null;
  const staff =
    profile && isStaff(profile)
      ? {
          profileId,
          name: [profile.profileName, profile.profileLastname]
            .filter(Boolean)
            .join(' '),
          gymId: profile.gymId || '',
          adminLevel: Number(profile.profileAdminLevel) || 0,
          // Equipo de NeoApp: puede trabajar sobre cualquier gimnasio
          isNeoApp:
            Number(profile.profileAdminLevel) >= 3 ||
            (Array.isArray(profile.role) &&
              profile.role.some((role) => NEOAPP_ROLES.includes(role))),
        }
      : null;

  staffCache.set(profileId, { staff, loadedAt: Date.now() });
  return staff;
};

const requireStaff =
  ({ allowMissingToken = false } = {}) =>
  async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      if (allowMissingToken && process.env.REQUIRE_STAFF_TOKEN !== 'true') {
        console.warn(
          `[staffAuth] ${req.method} ${req.originalUrl} without token (old panel?)`
        );
        return next();
      }
      return res
        .status(401)
        .json({ error: 'Your session has expired. Please log in again.' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      return res
        .status(401)
        .json({ error: 'Your session has expired. Please log in again.' });
    }

    try {
      const staff =
        payload?.profileId && !isRevoked(payload.profileId)
          ? await loadStaff(payload.profileId)
          : null;

      if (!staff) {
        return res
          .status(403)
          .json({ error: 'You do not have permission to change members.' });
      }

      req.staff = staff;
      next();
    } catch (error) {
      console.error('[staffAuth] Error checking staff:', error);
      res.status(500).json({ error: 'Error checking permissions' });
    }
  };

// Master Admin del gimnasio (nivel 2) o equipo de NeoApp
const isMasterStaff = (staff) =>
  !!staff && (staff.adminLevel >= 2 || staff.isNeoApp);

// Va despues de requireStaff()
const requireMaster = (req, res, next) => {
  if (!isMasterStaff(req.staff)) {
    return res
      .status(403)
      .json({ error: 'Only a Master Admin can do this.' });
  }
  next();
};

// Tras borrar o cambiar a un admin, que no siga valiendo lo guardado en memoria
const forgetStaff = (profileId) => staffCache.delete(profileId);

// Equipo NeoApp (desarrollo y soporte): no deja rastro de lo que hace
const isNeoAppProfile = async (profileId) => {
  if (!profileId) return false;
  try {
    return (await loadStaff(profileId))?.isNeoApp === true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  requireStaff,
  requireMaster,
  forgetStaff,
  isNeoAppProfile,
};
