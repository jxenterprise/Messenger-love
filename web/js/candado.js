/* ==========================================================================
   candado.js — PIN de 4 números para abrir la app en cada dispositivo
   --------------------------------------------------------------------------
   El PIN nunca se guarda tal cual: se guarda una huella PBKDF2-SHA256
   (150 000 vueltas + sal aleatoria). Vive solo en este dispositivo.
   ========================================================================== */
import { local } from './almacen.js';

const VUELTAS = 150000;
const MAX_INTENTOS_ANTES_DE_ESPERA = 5;
const MAX_INTENTOS_TOTALES = 10;
const ESPERA_MS = 30000;

const aBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
const deBase64 = (texto) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

async function derivar(pin, sal, vueltas = VUELTAS) {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: vueltas, hash: 'SHA-256' }, clave, 256);
  return new Uint8Array(bits);
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

const clavePin = (usuarioId) => `pin:${usuarioId}`;
const claveIntentos = (usuarioId) => `pin-intentos:${usuarioId}`;

export function tienePin(usuarioId) {
  return !!local.leer(clavePin(usuarioId));
}

export async function guardarPin(usuarioId, pin) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const huella = await derivar(pin, sal);
  local.guardar(clavePin(usuarioId), { sal: aBase64(sal), huella: aBase64(huella), vueltas: VUELTAS });
  local.borrar(claveIntentos(usuarioId));
}

export function borrarPin(usuarioId) {
  local.borrar(clavePin(usuarioId));
  local.borrar(claveIntentos(usuarioId));
}

/** Segundos que faltan para poder intentar de nuevo (0 si ya puede). */
export function esperaRestante(usuarioId) {
  const registro = local.leer(claveIntentos(usuarioId), { fallos: 0, hasta: 0 });
  return Math.max(0, Math.ceil((registro.hasta - Date.now()) / 1000));
}

/**
 * Comprueba el PIN.
 * @returns {Promise<{ok: boolean, esperar?: number, bloquear?: boolean, restantes?: number}>}
 */
export async function verificarPin(usuarioId, pin) {
  const guardado = local.leer(clavePin(usuarioId));
  if (!guardado) return { ok: false };
  const espera = esperaRestante(usuarioId);
  if (espera > 0) return { ok: false, esperar: espera };

  const huella = await derivar(pin, deBase64(guardado.sal), guardado.vueltas || VUELTAS);
  if (iguales(huella, deBase64(guardado.huella))) {
    local.borrar(claveIntentos(usuarioId));
    return { ok: true };
  }
  const registro = local.leer(claveIntentos(usuarioId), { fallos: 0, hasta: 0 });
  registro.fallos += 1;
  if (registro.fallos >= MAX_INTENTOS_TOTALES) return { ok: false, bloquear: true };
  if (registro.fallos % MAX_INTENTOS_ANTES_DE_ESPERA === 0) registro.hasta = Date.now() + ESPERA_MS;
  local.guardar(claveIntentos(usuarioId), registro);
  return {
    ok: false,
    esperar: registro.hasta > Date.now() ? Math.ceil(ESPERA_MS / 1000) : 0,
    restantes: MAX_INTENTOS_TOTALES - registro.fallos,
  };
}
