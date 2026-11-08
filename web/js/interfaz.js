/* ==========================================================================
   interfaz.js — Piezas de interfaz reutilizables
   (avisos flotantes, diálogos, hojas, visor de fotos, efectos y sonido)
   ========================================================================== */
import { icono } from './iconos.js';
import { $, escaparHtml, movimientoReducido } from './utilidades.js';

const raiz = () => $('#app');

/* ---------- Pila de capas (Escape y botón "atrás" de Android las cierran) ---------- */
const pila = [];
let popsIgnorados = 0;
let usarHistorial = !window.__VISTA_PREVIA__;

/**
 * Muestra un elemento como capa y devuelve la función para cerrarla.
 * @param {HTMLElement} elemento
 * @param {() => void} [alCerrar]
 */
export function abrirCapa(elemento, alCerrar) {
  raiz().appendChild(elemento);
  const entrada = { elemento, alCerrar, conHistorial: false, esperaHistorial: false };
  pila.push(entrada);
  // Si una capa recién cerrada todavía está "volviendo atrás" en el historial
  // (el navegador lo hace un instante después), se anota cuando termine.
  // Si no, dos diálogos seguidos (p. ej. la doble confirmación) se cruzan y
  // la página termina saliéndose de la app.
  if (popsIgnorados > 0) entrada.esperaHistorial = true;
  else anotarEnHistorial(entrada);
  return () => cerrarEntrada(entrada, true);
}

function anotarEnHistorial(entrada) {
  if (!usarHistorial) return;
  try {
    history.pushState({ capaEyj: pila.length }, '');
    entrada.conHistorial = true;
  } catch {
    usarHistorial = false;
  }
}

function cerrarEntrada(entrada, desdeLaApp) {
  const i = pila.indexOf(entrada);
  if (i === -1) return;
  entrada.esperaHistorial = false;
  pila.splice(i, 1);
  entrada.elemento.remove();
  entrada.alCerrar?.();
  if (desdeLaApp && entrada.conHistorial) {
    popsIgnorados += 1;
    history.back();
  }
}

export function hayCapasAbiertas() {
  return pila.length > 0;
}

export function cerrarTodasLasCapas() {
  while (pila.length) cerrarEntrada(pila[pila.length - 1], true);
}

window.addEventListener('popstate', () => {
  if (popsIgnorados > 0) {
    popsIgnorados -= 1;
    // Terminó de volver atrás: ahora sí se anotan las capas que se abrieron mientras tanto
    if (popsIgnorados === 0) {
      for (const e of pila) {
        if (e.esperaHistorial) {
          e.esperaHistorial = false;
          anotarEnHistorial(e);
        }
      }
    }
    return;
  }
  const ultima = pila[pila.length - 1];
  if (ultima) cerrarEntrada(ultima, false);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pila.length) {
    e.preventDefault();
    cerrarEntrada(pila[pila.length - 1], true);
  }
});

export function crearElemento(html) {
  const plantilla = document.createElement('template');
  plantilla.innerHTML = html.trim();
  return plantilla.content.firstElementChild;
}

/* ---------- Avisos flotantes ---------- */
/**
 * @param {string} texto
 * @param {{accion?: string, alAccionar?: () => void, duracion?: number}} [opciones]
 */
export function aviso(texto, { accion, alAccionar, duracion = 3200 } = {}) {
  const contenedor = $('#avisos-flotantes');
  if (!contenedor) return;
  const nodo = crearElemento(
    `<div class="aviso-flotante" role="status"><span>${escaparHtml(texto)}</span>${accion ? `<button type="button">${escaparHtml(accion)}</button>` : ''}</div>`,
  );
  const quitar = () => {
    nodo.classList.add('saliendo');
    setTimeout(() => nodo.remove(), 220);
  };
  if (accion) {
    nodo.querySelector('button').addEventListener('click', () => {
      alAccionar?.();
      quitar();
    });
  }
  contenedor.appendChild(nodo);
  while (contenedor.children.length > 3) contenedor.firstElementChild.remove();
  if (duracion) setTimeout(quitar, duracion);
  return quitar;
}

/* ---------- Diálogo de confirmación (reemplaza a confirm()) ---------- */
export function confirmar({ titulo, texto = '', aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    const capa = crearElemento(`
      <div class="capa centrada">
        <div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo">
          <h2 id="dialogo-titulo">${escaparHtml(titulo)}</h2>
          ${texto ? `<p>${escaparHtml(texto)}</p>` : ''}
          <div class="botones">
            <button type="button" class="boton fantasma" data-respuesta="no">${escaparHtml(cancelar)}</button>
            <button type="button" class="boton ${peligro ? 'peligro' : ''}" data-respuesta="si">${escaparHtml(aceptar)}</button>
          </div>
        </div>
      </div>`);
    let respondido = false;
    const cerrar = abrirCapa(capa, () => {
      if (!respondido) resolver(false);
    });
    capa.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-respuesta]');
      if (boton) {
        respondido = true;
        resolver(boton.dataset.respuesta === 'si');
        cerrar();
      } else if (e.target === capa) cerrar();
    });
    capa.querySelector('[data-respuesta="si"]').focus();
  });
}

/** Diálogo informativo con contenido HTML propio. */
export function dialogo(htmlInterior, etiqueta = 'Información') {
  const capa = crearElemento(
    `<div class="capa centrada"><div class="dialogo" role="dialog" aria-modal="true" aria-label="${escaparHtml(etiqueta)}">${htmlInterior}</div></div>`,
  );
  const cerrar = abrirCapa(capa);
  capa.addEventListener('click', (e) => {
    if (e.target === capa || e.target.closest('[data-cerrar]')) cerrar();
  });
  return { capa, cerrar };
}

/** Hoja que sube desde abajo (en computador se ve centrada). */
export function hoja(htmlInterior, etiqueta = 'Opciones') {
  const capa = crearElemento(
    `<div class="capa"><div class="hoja" role="dialog" aria-modal="true" aria-label="${escaparHtml(etiqueta)}"><div class="agarre" aria-hidden="true"></div>${htmlInterior}</div></div>`,
  );
  const cerrar = abrirCapa(capa);
  capa.addEventListener('click', (e) => {
    if (e.target === capa || e.target.closest('[data-cerrar]')) cerrar();
  });
  return { capa, hojaEl: capa.querySelector('.hoja'), cerrar };
}

/* ---------- Visor de fotos ---------- */
async function guardarImagen(url, nombreArchivo) {
  const respuesta = await fetch(url);
  const blob = await respuesta.blob();
  const archivo = new File([blob], nombreArchivo, { type: blob.type || 'image/webp' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo] });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 5000);
}

export function abrirVisor({ url, titulo = '', subtitulo = '', nombreArchivo = 'Foto_Messenger_EyJ.webp' }) {
  const visor = crearElemento(`
    <div class="visor" role="dialog" aria-modal="true" aria-label="Foto">
      <div class="barra-superior">
        <button type="button" class="boton-icono" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
        <div class="titulo">${escaparHtml(titulo)}<div class="subtitulo">${escaparHtml(subtitulo)}</div></div>
        ${
          // En la vista previa (dentro de Claude) las descargas están bloqueadas: se oculta el botón
          window.__VISTA_PREVIA__
            ? '<span class="boton-icono" aria-hidden="true"></span>'
            : `<button type="button" class="boton-icono" data-guardar aria-label="Guardar foto">${icono('descargar')}</button>`
        }
      </div>
      <div class="lienzo"><img alt="${escaparHtml(titulo || 'Foto')}" src="${escaparHtml(url)}"></div>
    </div>`);
  const cerrar = abrirCapa(visor);
  const lienzo = visor.querySelector('.lienzo');
  visor.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cerrar]')) return cerrar();
    // (en la vista previa no existe el botón, y así el código de guardar ni se incluye)
    if (!window.__VISTA_PREVIA__ && e.target.closest('[data-guardar]')) {
      try {
        await guardarImagen(url, nombreArchivo);
      } catch {
        aviso('No se pudo guardar la foto. Intenta de nuevo con internet.');
      }
      return;
    }
    if (e.target.tagName === 'IMG') lienzo.classList.toggle('zoom');
    else if (e.target === lienzo && !lienzo.classList.contains('zoom')) cerrar();
  });
  return cerrar;
}

/* ---------- Lluvia de corazones ---------- */
export function lluviaDeCorazones(emojis = ['❤️', '💜', '💕', '💖', '🩷']) {
  if (movimientoReducido()) return;
  const capa = document.createElement('div');
  capa.className = 'lluvia';
  capa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.textContent = emojis[i % emojis.length];
    s.style.left = `${Math.random() * 96}%`;
    s.style.setProperty('--tam', `${18 + Math.random() * 28}px`);
    s.style.setProperty('--dur', `${2.4 + Math.random() * 1.8}s`);
    s.style.setProperty('--retraso', `${Math.random() * 1.1}s`);
    s.style.setProperty('--deriva', `${(Math.random() - 0.5) * 140}px`);
    s.style.setProperty('--giro', `${(Math.random() - 0.5) * 90}deg`);
    capa.appendChild(s);
  }
  raiz().appendChild(capa);
  setTimeout(() => capa.remove(), 5200);
}

/* ---------- Sonido suave al recibir un mensaje (sin archivos de audio) ---------- */
let contextoAudio = null;

/** Debe llamarse en el primer toque: iPhone solo deja sonar audio después de un gesto. */
export function prepararSonido() {
  try {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    contextoAudio ||= new Contexto();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();
  } catch {
    /* sin sonido */
  }
}

export function sonarMensaje() {
  try {
    if (!contextoAudio || contextoAudio.state !== 'running') return;
    const t = contextoAudio.currentTime;
    [880, 1318.5].forEach((frecuencia, i) => {
      const osc = contextoAudio.createOscillator();
      const vol = contextoAudio.createGain();
      const inicio = t + i * 0.09;
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, inicio);
      vol.gain.exponentialRampToValueAtTime(0.09, inicio + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.32);
      osc.connect(vol).connect(contextoAudio.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.36);
    });
  } catch {
    /* nada */
  }
}
