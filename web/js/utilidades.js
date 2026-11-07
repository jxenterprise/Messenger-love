/* ==========================================================================
   utilidades.js — Funciones pequeñas que usa toda la app
   ========================================================================== */

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

export const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** Escapa texto para insertarlo con seguridad en HTML (evita inyecciones). */
export function escaparHtml(texto) {
  return String(texto ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Identificador único (para los mensajes que se crean en el celular). */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Convierte las direcciones web del texto en enlaces (el texto ya va escapado). */
export function textoConEnlaces(texto) {
  return escaparHtml(texto).replace(
    /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi,
    (url) => {
      const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    },
  );
}

/** Recorta un texto largo y le pone puntos suspensivos. */
export function recortar(texto, max = 80) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function capitalizar(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
}

/* ---------- Emojis ---------- */
const segmentador =
  typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;
const RE_PICTOGRAFICO = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function grafemas(texto) {
  return segmentador ? [...segmentador.segment(texto)].map((s) => s.segment) : Array.from(texto);
}

/** Si el mensaje son solo 1 a 3 emojis, devuelve cuántos (para mostrarlos grandes). */
export function contarSoloEmojis(texto) {
  const t = String(texto ?? '').trim();
  if (!t || t.length > 48) return 0;
  const visibles = grafemas(t).filter((g) => g.trim() !== '');
  if (visibles.length === 0 || visibles.length > 3) return 0;
  return visibles.every((g) => RE_PICTOGRAFICO.test(g)) ? visibles.length : 0;
}

const EMOJIS_AMOR = new Set(['❤️', '❤', '♥️', '💜', '💖', '💕', '💗', '💓', '💞', '💘', '💝', '🩷', '❣️', '🥰', '😍', '😘', '🫶', '💋']);

/** true si el mensaje es un único emoji de amor (activa la lluvia de corazones). */
export function esEmojiDeAmor(texto) {
  const visibles = grafemas(String(texto ?? '').trim()).filter((g) => g.trim() !== '');
  return visibles.length === 1 && EMOJIS_AMOR.has(visibles[0]);
}

/* ---------- Fechas y horas (español de Colombia) ---------- */
const fmtHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDiaSemana = new Intl.DateTimeFormat('es-CO', { weekday: 'long' });
const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' });
const fmtFechaAno = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtCompleta = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "3:45 p. m." */
export function hora(iso) {
  return iso ? fmtHora.format(new Date(iso)) : '';
}

function inicioDelDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Clave para agrupar mensajes por día. */
export function claveDia(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Hoy", "Ayer", "Lunes" o "3 de noviembre". */
export function etiquetaDia(iso) {
  const d = inicioDelDia(iso);
  const hoy = inicioDelDia(Date.now());
  const diferencia = Math.round((hoy - d) / 86400000);
  if (diferencia === 0) return 'Hoy';
  if (diferencia === 1) return 'Ayer';
  if (diferencia > 1 && diferencia < 7) return capitalizar(fmtDiaSemana.format(d));
  return (d.getFullYear() === hoy.getFullYear() ? fmtFecha : fmtFechaAno).format(d);
}

/** "a las 3:45 p. m." (o "a la 1:05 p. m.") */
function aLas(iso) {
  const h = new Date(iso).getHours() % 12;
  return `${h === 1 ? 'a la' : 'a las'} ${hora(iso)}`;
}

/** "últ. vez hoy a las 3:45 p. m." */
export function textoUltimaVez(iso) {
  if (!iso) return '';
  const dia = etiquetaDia(iso);
  if (dia === 'Hoy') return `últ. vez hoy ${aLas(iso)}`;
  if (dia === 'Ayer') return `últ. vez ayer ${aLas(iso)}`;
  return `últ. vez el ${dia.toLowerCase()} ${aLas(iso)}`;
}

/** "lunes, 3 de noviembre, 3:45 p. m." */
export function fechaCompleta(iso) {
  return iso ? fmtCompleta.format(new Date(iso)) : '—';
}

/** 75 → "1:15" */
export function duracionTexto(segundos) {
  const s = Math.max(0, Math.round(segundos || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- Control de frecuencia ---------- */
export function limitar(fn, ms) {
  let ultimo = 0;
  return (...args) => {
    const ahora = Date.now();
    if (ahora - ultimo >= ms) {
      ultimo = ahora;
      fn(...args);
    }
  };
}

export function retrasar(fn, ms) {
  let t;
  const envuelta = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  envuelta.cancelar = () => clearTimeout(t);
  return envuelta;
}

/* ---------- Dispositivo ---------- */
export function plataforma() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const tactil = window.matchMedia?.('(hover: none)').matches ?? false;
  return { ios, android, standalone, tactil };
}

export function vibrar(patron) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* no soportado */
  }
}

export const movimientoReducido = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Base64 URL-safe → bytes (para la clave VAPID). */
export function base64UrlABytes(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  const base64 = (texto + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Detecta errores de red (sin internet, servidor caído, tiempo agotado). */
export function esErrorDeRed(error) {
  if (!navigator.onLine) return true;
  if (!error) return false;
  const texto = `${error.message ?? ''} ${error.name ?? ''} ${error.details ?? ''}`;
  if (/failed to fetch|fetch failed|failed to send|networkerror|network request failed|load failed|timeout|timed out|aborterror|offline|sin conexi/i.test(texto)) return true;
  const crudo = error.status ?? error.statusCode;
  if (crudo === undefined || crudo === null || crudo === '') return false;
  const estado = Number(crudo);
  return estado === 0 || estado >= 500;
}

/**
 * Explica por qué no se pudo entrar (o cambiar el PIN), según lo que responde
 * el servidor: { motivo: 'datos' | 'esperar' | 'bloqueado' | 'sin-pin', segundos, restantes }.
 */
export function textoRechazoPin({ motivo, segundos, restantes } = {}) {
  if (motivo === 'esperar') {
    const minutos = Math.max(1, Math.ceil((Number(segundos) || 900) / 60));
    return `Demasiados intentos. Espera ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y vuelve a intentar.`;
  }
  if (motivo === 'bloqueado') return 'Cuenta bloqueada por seguridad (muchos intentos fallidos). Jampier la desbloquea desde Supabase con supabase/03_pin.sql.';
  if (motivo === 'sin-pin') return 'Todavía no se ha creado el PIN. Créalo en Supabase con supabase/03_pin.sql (mira la guía).';
  const quedan = Number(restantes);
  return Number.isFinite(quedan) && quedan <= 5
    ? `Usuario o PIN incorrectos. Te quedan ${quedan} ${quedan === 1 ? 'intento' : 'intentos'} antes del bloqueo.`
    : 'Usuario o PIN incorrectos.';
}
