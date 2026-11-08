/* ==========================================================================
   media.js — Fotos (se comprimen a WebP en el celular antes de subirlas)
   y notas de voz (grabación con forma de onda).
   ========================================================================== */

/* ---------- Fotos ---------- */
let soporteWebp = null;

/** ¿El navegador sabe crear WebP? (Safari/iPhone no: usa el motor WASM). */
export function soportaWebpNativo() {
  if (soporteWebp !== null) return soporteWebp;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    soporteWebp = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    soporteWebp = false;
  }
  return soporteWebp;
}

async function abrirImagen(archivo) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      /* se intenta con <img> */
    }
  }
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      resolver(img);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo abrir esa imagen. Prueba con otra foto.'));
    };
    img.src = url;
  });
}

function canvasABlob(canvas, tipo, calidad) {
  return new Promise((resolver) => canvas.toBlob((b) => resolver(b), tipo, calidad));
}

/** Codifica a WebP con libwebp (WebAssembly) cuando el navegador no puede. */
async function webpConWasm(ctx, ancho, alto, calidad) {
  const modulo = await import('./vendor/webp/encode.js');
  const datos = ctx.getImageData(0, 0, ancho, alto);
  const buffer = await modulo.default(datos, { quality: Math.round(calidad * 100) });
  return new Blob([buffer], { type: 'image/webp' });
}

/** Miniatura diminuta (≈1 KB) que se ve borrosa mientras carga la foto real. */
function miniatura(fuente, ancho, alto) {
  try {
    const c = document.createElement('canvas');
    const escala = 24 / Math.max(ancho, alto);
    c.width = Math.max(1, Math.round(ancho * escala));
    c.height = Math.max(1, Math.round(alto * escala));
    c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

/**
 * Comprime una foto: máximo `maxLado` píxeles, WebP de buena calidad.
 * @returns {Promise<{blob: Blob, tipo: string, ext: string, ancho: number, alto: number, miniatura: string|null}>}
 */
/** Ninguna foto que se envía pesa más que esto (las de la cámara salen de 5 a 20 MB). */
export const MAX_BYTES_FOTO = 5 * 1024 * 1024;

/**
 * Comprime una foto (galería o cámara) a WebP y GARANTIZA que pese menos de
 * maxBytes: si no cabe, la vuelve a comprimir más pequeña y con menos calidad.
 * Normalmente queda entre 0,1 y 0,6 MB al primer intento.
 */
export async function comprimirImagen(archivo, { maxLado = 1600, calidad = 0.82, cuadrado = false, maxBytes = MAX_BYTES_FOTO } = {}) {
  let lado = maxLado;
  let q = calidad;
  let r = await comprimirUnaVez(archivo, { maxLado: lado, calidad: q, cuadrado });
  for (let intento = 1; r.blob.size > maxBytes && intento <= 5; intento++) {
    lado = Math.max(480, Math.round(lado * 0.75));
    q = Math.max(0.45, q - 0.1);
    r = await comprimirUnaVez(archivo, { maxLado: lado, calidad: q, cuadrado });
  }
  if (r.blob.size > maxBytes) throw new Error('La foto quedó muy pesada. Intenta con otra.');
  return r;
}

async function comprimirUnaVez(archivo, { maxLado, calidad, cuadrado }) {
  const fuente = await abrirImagen(archivo);
  const w0 = fuente.width;
  const h0 = fuente.height;
  let sx = 0;
  let sy = 0;
  let sw = w0;
  let sh = h0;
  if (cuadrado) {
    const lado = Math.min(w0, h0);
    sx = (w0 - lado) / 2;
    sy = (h0 - lado) / 2;
    sw = sh = lado;
  }
  const escala = Math.min(1, maxLado / Math.max(sw, sh));
  const ancho = Math.max(1, Math.round(sw * escala));
  const alto = Math.max(1, Math.round(sh * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d', { willReadFrequently: !soportaWebpNativo() });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, sx, sy, sw, sh, 0, 0, ancho, alto);
  fuente.close?.();

  const mini = miniatura(canvas, ancho, alto);
  let blob = null;
  if (soportaWebpNativo()) blob = await canvasABlob(canvas, 'image/webp', calidad);
  if (!blob || blob.type !== 'image/webp') blob = await webpConWasm(ctx, ancho, alto, calidad).catch(() => null);
  if (blob && blob.type === 'image/webp') return { blob, tipo: 'image/webp', ext: 'webp', ancho, alto, miniatura: mini };

  // Último recurso: JPEG (si el motor WebP no pudo cargar)
  blob = await canvasABlob(canvas, 'image/jpeg', 0.85);
  return { blob, tipo: 'image/jpeg', ext: 'jpg', ancho, alto, miniatura: mini };
}

/* ---------- Notas de voz ---------- */
const MAX_SEGUNDOS = 300;

function elegirFormato() {
  // Primero MP4/AAC (suena en iPhone y Android), luego WebM/Opus
  const candidatos = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder?.isTypeSupported) return '';
  return candidatos.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function extensionDe(tipo) {
  if (tipo.includes('mp4') || tipo.includes('aac')) return 'm4a';
  if (tipo.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Reduce las muestras de volumen a 40 barras (0–100) para dibujar la onda. */
function resumirOnda(muestras, barras = 40) {
  if (!muestras.length) return Array.from({ length: barras }, () => 12);
  const resultado = [];
  const paso = muestras.length / barras;
  for (let i = 0; i < barras; i++) {
    const tramo = muestras.slice(Math.floor(i * paso), Math.max(Math.floor((i + 1) * paso), Math.floor(i * paso) + 1));
    resultado.push(Math.max(...tramo));
  }
  const tope = Math.max(...resultado, 0.05);
  return resultado.map((v) => Math.max(8, Math.round((v / tope) * 100)));
}

export class GrabadoraVoz {
  static soportada() {
    return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  }

  /**
   * Empieza a grabar. Debe llamarse dentro del toque del usuario.
   * @param {(nivel:number)=>void} alNivel  Recibe el volumen (0–1) cada ~100 ms.
   * @param {()=>void} alLlegarAlMaximo    Se llama a los 5 minutos.
   */
  async iniciar(alNivel, alLlegarAlMaximo) {
    // El AudioContext se crea antes del primer await (iPhone lo exige)
    const Contexto = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = Contexto ? new Contexto() : null;
    this.muestras = [];
    this.trozos = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.tipo = elegirFormato();
    const opciones = this.tipo ? { mimeType: this.tipo, audioBitsPerSecond: 32000 } : undefined;
    this.grabadora = new MediaRecorder(this.stream, opciones);
    this.tipo = this.grabadora.mimeType || this.tipo || 'audio/webm';
    this.grabadora.ondataavailable = (e) => e.data?.size && this.trozos.push(e.data);
    this.grabadora.start(250);
    this.inicio = performance.now();

    if (this.audioCtx) {
      try {
        await this.audioCtx.resume?.();
        const fuente = this.audioCtx.createMediaStreamSource(this.stream);
        this.analizador = this.audioCtx.createAnalyser();
        this.analizador.fftSize = 512;
        fuente.connect(this.analizador);
        const datos = new Uint8Array(this.analizador.fftSize);
        this.intervalo = setInterval(() => {
          this.analizador.getByteTimeDomainData(datos);
          let suma = 0;
          for (const v of datos) suma += ((v - 128) / 128) ** 2;
          const nivel = Math.min(1, Math.sqrt(suma / datos.length) * 3.2);
          this.muestras.push(nivel);
          alNivel?.(nivel);
          if (this.segundos() >= MAX_SEGUNDOS) alLlegarAlMaximo?.();
        }, 100);
      } catch {
        /* sin onda en vivo; la grabación sigue */
      }
    }
  }

  segundos() {
    return this.inicio ? (performance.now() - this.inicio) / 1000 : 0;
  }

  _limpiar() {
    clearInterval(this.intervalo);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audioCtx?.close?.().catch(() => {});
  }

  /** Termina y entrega el audio. */
  detener() {
    return new Promise((resolver, rechazar) => {
      if (!this.grabadora) return rechazar(new Error('No hay grabación'));
      const duracion = this.segundos();
      this.grabadora.onstop = () => {
        this._limpiar();
        const blob = new Blob(this.trozos, { type: this.tipo.split(';')[0] });
        if (!blob.size) return rechazar(new Error('La grabación quedó vacía. Intenta otra vez.'));
        resolver({
          blob,
          tipo: blob.type,
          ext: extensionDe(blob.type),
          duracion: Math.max(1, Math.round(duracion)),
          onda: resumirOnda(this.muestras),
        });
      };
      try {
        this.grabadora.requestData?.();
      } catch {
        /* algunos navegadores no lo permiten aquí */
      }
      this.grabadora.stop();
    });
  }

  cancelar() {
    try {
      if (this.grabadora && this.grabadora.state !== 'inactive') {
        this.grabadora.onstop = null;
        this.grabadora.stop();
      }
    } catch {
      /* nada */
    }
    this._limpiar();
  }
}

/**
 * Grabadora de mentira para la vista previa (allí el navegador no deja usar
 * el micrófono). Muestra la misma interfaz y envía la nota de ejemplo.
 */
export class GrabadoraSimulada {
  static soportada() {
    return true;
  }

  async iniciar(alNivel) {
    this.muestras = [];
    this.inicio = performance.now();
    let fase = 0;
    this.intervalo = setInterval(() => {
      fase += 0.35;
      const nivel = Math.min(1, Math.abs(Math.sin(fase) * 0.6 + Math.sin(fase * 2.7) * 0.3) + Math.random() * 0.2);
      this.muestras.push(nivel);
      alNivel?.(nivel);
    }, 100);
  }

  segundos() {
    return this.inicio ? (performance.now() - this.inicio) / 1000 : 0;
  }

  async detener() {
    clearInterval(this.intervalo);
    return { blob: null, rutaDemo: 'demo/nota-de-voz.m4a', tipo: 'audio/mp4', ext: 'm4a', duracion: 5, onda: resumirOnda(this.muestras) };
  }

  cancelar() {
    clearInterval(this.intervalo);
  }
}
