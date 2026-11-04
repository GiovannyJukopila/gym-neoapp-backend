const { matchActivity } = require('../utils/activityCatalog');
const { runWithContext, currentContext } = require('../utils/activityCapture');
const { writeEntries, resolveRequestActor } = require('../utils/activityEntry');
const { resolveTargetName } = require('../utils/activityLog');

/**
 * Actividad de cada peticion. Se monta una sola vez delante de todas las rutas.
 *
 *  - Abre un contexto: cualquier escritura en Firestore durante la peticion
 *    queda capturada con sus datos antes y despues (utils/activityCapture.js).
 *  - Al responder, se guarda la entrada: quien (staff, socio, escaner...),
 *    que (catalogo o deducido de los datos), a quien y todos los cambios.
 *  - Si la peticion escribe algo despues de responder, se añade a la misma
 *    entrada unos instantes despues.
 *  - No retrasa la respuesta: se escribe cuando ya se ha respondido.
 */

const LATE_WRITES_DELAY_MS = 1500;

const activityTrail = (req, res, next) => {
  const match = matchActivity(req.method, req.path);
  const path = req.path;

  const info = {
    params: match?.params || {},
    get body() {
      return req.body;
    },
    get query() {
      return req.query;
    },
    response: undefined,
  };

  // Lo que responde la ruta (ids nuevos, quien hizo login...)
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    info.response = body;
    return originalJson(body);
  };

  runWithContext({ source: 'request', req, path, match, info }, async () => {
    const ctx = currentContext();

    // En los borrados el nombre se busca antes de que desaparezca
    if (match?.entry.resolveBefore) {
      try {
        const target = match.entry.target?.(info);
        if (target) {
          info.resolvedTargetName = await resolveTargetName(target.type, target.id);
        }
      } catch (error) {
        // sin nombre: se usara el id
      }
    }

    let finished = false;
    let timer = null;
    let actorPromise = null;
    const actor = () => (actorPromise = actorPromise || resolveRequestActor(ctx));

    // Entrada ya escrita: las escrituras tardias se le añaden
    let written = null;
    const flush = () =>
      actor()
        .then((who) => writeEntries(ctx, who, info, { appendTo: written }))
        .then((entry) => {
          written = written || entry || null;
        })
        .catch((error) =>
          console.error('[activity] Could not record activity:', error.message)
        );

    // Escrituras que llegan despues de responder
    ctx.listeners.push(() => {
      if (!finished) return;
      clearTimeout(timer);
      timer = setTimeout(flush, LATE_WRITES_DELAY_MS);
    });

    res.on('finish', () => {
      finished = true;
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      // Una accion que falla solo se registra si llego a cambiar datos
      if (!ok && !ctx.changes.length) return;
      if (!ok) {
        ctx.match = null;
        info.failedStatus = res.statusCode;
      }
      flush();
    });

    next();
  });
};

module.exports = activityTrail;
