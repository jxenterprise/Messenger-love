/* ==========================================================================
   notificaciones.js — Suscripción a notificaciones push (Web Push + VAPID)
   --------------------------------------------------------------------------
   En iPhone solo funciona con la app instalada en la pantalla de inicio
   (iOS 16.4 o más reciente) y el permiso se pide con un toque del usuario.
   ========================================================================== */
import { base64UrlABytes } from './utilidades.js';

export function soportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function estadoPermiso() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function mismaClave(suscripcion, claveBytes) {
  const actual = suscripcion?.options?.applicationServerKey;
  if (!actual) return true;
  const a = new Uint8Array(actual);
  return a.length === claveBytes.length && a.every((v, i) => v === claveBytes[i]);
}

/** Crea (o reutiliza) la suscripción de este dispositivo. */
export async function suscribir(registro, clavePublicaVapid) {
  const clave = base64UrlABytes(clavePublicaVapid);
  let suscripcion = await registro.pushManager.getSubscription();
  if (suscripcion && !mismaClave(suscripcion, clave)) {
    await suscripcion.unsubscribe();
    suscripcion = null;
  }
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
  }
  return suscripcion;
}

/** Datos que se guardan en la tabla suscripciones_push. */
export function datosSuscripcion(suscripcion) {
  const json = suscripcion.toJSON();
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Cancela la suscripción de este dispositivo y devuelve su endpoint. */
export async function desuscribir(registro) {
  const suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) return null;
  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe().catch(() => {});
  return endpoint;
}

export async function suscripcionActual(registro) {
  try {
    return await registro.pushManager.getSubscription();
  } catch {
    return null;
  }
}
