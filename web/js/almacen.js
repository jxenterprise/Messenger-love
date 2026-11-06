/* ==========================================================================
   almacen.js — Guardado local en el dispositivo
   --------------------------------------------------------------------------
   · local: preferencias pequeñas (tema, fondo, PIN cifrado) en localStorage.
   · kv:    datos grandes (mensajes guardados, bandeja de salida, fotos
            pendientes) en IndexedDB.
   Todo va envuelto en try/catch: si el navegador bloquea el almacenamiento
   (modo privado, por ejemplo) la app sigue funcionando en memoria.
   ========================================================================== */

const PREFIJO = 'eyj:';
const memoriaLocal = new Map();

export const local = {
  leer(clave, porDefecto = null) {
    try {
      const valor = localStorage.getItem(PREFIJO + clave);
      return valor === null ? porDefecto : JSON.parse(valor);
    } catch {
      return memoriaLocal.has(clave) ? memoriaLocal.get(clave) : porDefecto;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
    } catch {
      memoriaLocal.set(clave, valor);
    }
  },
  borrar(clave) {
    try {
      localStorage.removeItem(PREFIJO + clave);
    } catch {
      memoriaLocal.delete(clave);
    }
  },
};

/* ---------- IndexedDB (clave → valor) ---------- */
const NOMBRE_BD = 'messenger-eyj';
const ALMACEN = 'kv';
const memoriaKv = new Map();
let promesaBd = null;

function abrirBd() {
  if (promesaBd) return promesaBd;
  promesaBd = new Promise((resolver, rechazar) => {
    try {
      const peticion = indexedDB.open(NOMBRE_BD, 1);
      peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN);
      peticion.onsuccess = () => resolver(peticion.result);
      peticion.onerror = () => rechazar(peticion.error);
      peticion.onblocked = () => rechazar(new Error('IndexedDB bloqueado'));
    } catch (error) {
      rechazar(error);
    }
  }).catch((error) => {
    promesaBd = Promise.reject(error);
    promesaBd.catch(() => {});
    throw error;
  });
  return promesaBd;
}

function transaccion(modo, accion) {
  return abrirBd().then(
    (bd) =>
      new Promise((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN, modo);
        const peticion = accion(tx.objectStore(ALMACEN));
        tx.oncomplete = () => resolver(peticion?.result);
        tx.onerror = () => rechazar(tx.error);
        tx.onabort = () => rechazar(tx.error);
      }),
  );
}

export const kv = {
  async leer(clave) {
    try {
      return await transaccion('readonly', (s) => s.get(clave));
    } catch {
      return memoriaKv.get(clave);
    }
  },
  async guardar(clave, valor) {
    try {
      await transaccion('readwrite', (s) => s.put(valor, clave));
    } catch {
      memoriaKv.set(clave, valor);
    }
  },
  async borrar(clave) {
    try {
      await transaccion('readwrite', (s) => s.delete(clave));
    } catch {
      memoriaKv.delete(clave);
    }
  },
};
