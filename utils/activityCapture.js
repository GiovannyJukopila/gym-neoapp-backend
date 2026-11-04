/**
 * Captura TODOS los cambios de datos (crear, editar, borrar) en cualquier
 * coleccion, con sus datos antes y despues, sin tener que tocar cada
 * controlador.
 *
 * Como funciona
 * -------------
 *  - Cada peticion (y cada ejecucion del proceso diario) abre un "contexto"
 *    con AsyncLocalStorage: todo lo que se escribe mientras dura queda
 *    asociado a ella y a quien la hizo.
 *  - En el SDK de Firestore todas las escrituras terminan en
 *    WriteBatch._commit: un set/update/delete suelto, un batch y una
 *    transaccion. Ahi se engancha la captura, una sola vez.
 *  - Los datos "antes" salen de lo que la propia peticion ya leyo (sin coste)
 *    o, si no, de una lectura justo antes de escribir (1 lectura por
 *    documento). En una transaccion, lo que ella leyo se toma de su lectura;
 *    lo que no leyo no esta bloqueado por ella y se lee aparte.
 *  - Si la escritura falla, no se registra nada.
 *
 * Fuera de un contexto (scripts, arranque del servidor) no se captura nada.
 */
const { AsyncLocalStorage } = require('async_hooks');
const { Firestore, WriteBatch, Transaction, DocumentReference } = require(
  require.resolve('@google-cloud/firestore', {
    paths: [require.resolve('firebase-admin')],
  })
);
const { IGNORED_COLLECTIONS, applyWrite } = require('./activityDiff');

const storage = new AsyncLocalStorage();

const currentContext = () => storage.getStore() || null;

/**
 * Ejecuta fn dentro de un contexto de actividad.
 * @param context { source: 'request'|'system', ... } (ver activityTrail)
 */
const runWithContext = (context, fn) =>
  storage.run(
    {
      changes: [],
      reads: new Map(), // ruta -> datos leidos en esta peticion
      listeners: [],
      ...context,
    },
    fn
  );

const collectionOf = (ref) => ref?.parent?.id || '';
const shouldCapture = (ref) =>
  !!ref && !IGNORED_COLLECTIONS.has(collectionOf(ref));

const snapshotData = (snapshot) =>
  snapshot && snapshot.exists ? snapshot.data() : null;

// update(campo, valor, campo, valor...) -> { campo: valor }
const updateArgsToObject = (dataOrField, rest) => {
  if (typeof dataOrField !== 'string' && !dataOrField?.segments) {
    return dataOrField;
  }
  const pairs = [dataOrField, ...rest];
  const out = {};
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const field = pairs[i];
    out[field?.segments ? field.segments.join('.') : String(field)] = pairs[i + 1];
  }
  return out;
};

let installed = false;

const install = () => {
  if (installed) return;
  installed = true;

  // ---- 1. Lo que la peticion lee: sirve como "antes" sin leer otra vez ----
  const originalDocGet = DocumentReference.prototype.get;
  DocumentReference.prototype.get = function patchedGet(...args) {
    const context = currentContext();
    const result = originalDocGet.apply(this, args);
    if (context && shouldCapture(this)) {
      result
        .then((snapshot) => {
          if (!context.reads.has(this.path)) {
            context.reads.set(this.path, snapshotData(snapshot));
          }
        })
        .catch(() => {});
    }
    return result;
  };

  // Lecturas dentro de una transaccion: se guardan en su batch
  const rememberTransactionRead = (transaction, snapshot) => {
    if (!snapshot?.ref || !shouldCapture(snapshot.ref)) return;
    const batch = transaction._writeBatch;
    if (!batch) return;
    batch.__activityReads = batch.__activityReads || new Map();
    batch.__activityReads.set(snapshot.ref.path, snapshotData(snapshot));
  };

  const originalTxGet = Transaction.prototype.get;
  Transaction.prototype.get = function patchedTxGet(refOrQuery, ...rest) {
    const result = originalTxGet.call(this, refOrQuery, ...rest);
    if (!currentContext()) return result;
    return result.then((snapshot) => {
      if (snapshot?.docs) {
        snapshot.docs.forEach((doc) => rememberTransactionRead(this, doc));
      } else {
        rememberTransactionRead(this, snapshot);
      }
      return snapshot;
    });
  };

  const originalTxGetAll = Transaction.prototype.getAll;
  Transaction.prototype.getAll = function patchedTxGetAll(...args) {
    const result = originalTxGetAll.apply(this, args);
    if (!currentContext()) return result;
    return result.then((snapshots) => {
      snapshots.forEach((snapshot) => rememberTransactionRead(this, snapshot));
      return snapshots;
    });
  };

  // ---- 2. Que se va a escribir ----
  const recordOp = (batch, ref, op) => {
    if (!currentContext() || !shouldCapture(ref)) return;
    batch.__activityOps = batch.__activityOps || [];
    batch.__activityOps.push({ ref, ...op });
  };

  const originalCreate = WriteBatch.prototype.create;
  WriteBatch.prototype.create = function patchedCreate(ref, data) {
    const result = originalCreate.call(this, ref, data);
    recordOp(this, ref, { type: 'create', data });
    return result;
  };

  const originalSet = WriteBatch.prototype.set;
  WriteBatch.prototype.set = function patchedSet(ref, data, options) {
    const result = originalSet.call(this, ref, data, options);
    recordOp(this, ref, { type: 'set', data, options });
    return result;
  };

  const originalUpdate = WriteBatch.prototype.update;
  WriteBatch.prototype.update = function patchedUpdate(ref, dataOrField, ...rest) {
    const result = originalUpdate.call(this, ref, dataOrField, ...rest);
    recordOp(this, ref, {
      type: 'update',
      data: updateArgsToObject(dataOrField, rest),
    });
    return result;
  };

  const originalDelete = WriteBatch.prototype.delete;
  WriteBatch.prototype.delete = function patchedDelete(ref, ...rest) {
    const result = originalDelete.call(this, ref, ...rest);
    recordOp(this, ref, { type: 'delete' });
    return result;
  };

  // Un reintento de transaccion vuelve a empezar: se olvida lo anterior
  const originalReset = WriteBatch.prototype._reset;
  WriteBatch.prototype._reset = function patchedReset(...args) {
    this.__activityOps = [];
    return originalReset.apply(this, args);
  };

  // ---- 3. Al confirmar: datos antes, escritura, datos despues ----
  const originalCommit = WriteBatch.prototype._commit;
  WriteBatch.prototype._commit = async function patchedCommit(commitOptions) {
    const context = currentContext();
    const ops = this.__activityOps || [];
    if (!context || !ops.length) {
      return originalCommit.call(this, commitOptions);
    }

    const known = new Map([
      ...context.reads,
      ...(this.__activityReads || new Map()),
    ]);

    // Lo que no se leyo antes se lee ahora (lectura normal, fuera de la
    // transaccion: esos documentos no los tiene bloqueados)
    const missing = [
      ...new Map(
        ops
          .filter((op) => op.type !== 'create' && !known.has(op.ref.path))
          .map((op) => [op.ref.path, op.ref])
      ).values(),
    ];
    if (missing.length) {
      try {
        const snapshots = await this._firestore.getAll(...missing);
        snapshots.forEach((snapshot) =>
          known.set(snapshot.ref.path, snapshotData(snapshot))
        );
      } catch (error) {
        // Sin "antes": se registra igualmente lo que se escribio
      }
    }

    const result = await originalCommit.call(this, commitOptions);

    // Varias escrituras al mismo documento en un batch se encadenan
    const state = new Map();
    ops.forEach((op) => {
      const path = op.ref.path;
      const before = state.has(path)
        ? state.get(path)
        : known.has(path)
        ? known.get(path)
        : op.type === 'create'
        ? null
        : undefined;
      const after = applyWrite(op, before ?? null);
      state.set(path, after);
      context.reads.set(path, after);
      context.changes.push({
        collection: collectionOf(op.ref),
        id: op.ref.id,
        // Subcolecciones: la clase o el socio al que pertenecen
        parentCollection: op.ref.parent?.parent?.parent?.id || '',
        parentId: op.ref.parent?.parent?.id || '',
        path,
        type: op.type,
        before: before === undefined ? null : before,
        beforeKnown: before !== undefined,
        after,
      });
    });
    this.__activityOps = [];
    context.listeners.forEach((listener) => listener());

    return result;
  };
};

install();

module.exports = { runWithContext, currentContext };
