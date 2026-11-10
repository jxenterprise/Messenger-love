/* ==========================================================================
   papelera.js — La Papelera del chat (/papelera)
   --------------------------------------------------------------------------
   Muestra los mensajes que cualquiera de los dos eliminó del chat: quién lo
   escribió, qué día lo envió, qué día lo eliminó y qué decía (con la foto o
   la nota de voz, si tenía).

   Importante: esta página es de LOS DOS, no de uno solo. Los dos entran igual
   y ven exactamente lo mismo; por eso el chat avisa, al eliminar, que el
   mensaje queda guardado aquí. Para que no quede nada está "Vaciar todo el
   chat", que sí borra de verdad.

   Seguridad: la base de datos solo deja leer mensajes a las 2 cuentas (RLS).
   Además, si este dispositivo tiene PIN, aquí se pide igual que en el chat.
   ========================================================================== */
import { CONFIG, FALTA_CONEXION, MODO_DEMO } from '../js/config.js';
import { BackendDemo } from '../js/backend-demo.js';
import { BackendSupabase } from '../js/backend-supabase.js';
import { icono, pintarIconos } from '../js/iconos.js';
import { esperaRestante, tienePin, verificarPin } from '../js/candado.js';
import { $, claveDia, duracionTexto, escaparHtml, esErrorDeRed, etiquetaDia, fechaCompleta, hora, textoConEnlaces } from '../js/utilidades.js';

const estado = {
  backend: null,
  yo: null,
  perfiles: new Map(),
  borrados: [],
  filtro: 'todos',
};

const pantallas = ['estado-cargando', 'estado-sin-sesion', 'estado-pin', 'estado-error', 'estado-vacio', 'estado-lista'];

/** Muestra una sola sección y esconde las demás. */
function mostrar(id) {
  for (const p of pantallas) $(`#${p}`).hidden = p !== id;
}

function nombreDe(id) {
  return estado.perfiles.get(id)?.nombre || 'Tu amor';
}

/* ==========================================================================
   Arranque
   ========================================================================== */
async function iniciar() {
  $('[data-version]').textContent = `v${CONFIG.VERSION}`;
  pintarIconos(document);

  if (FALTA_CONEXION) return mostrar('estado-sin-sesion');

  // En la vista previa las fotos y el audio viven una carpeta más arriba
  estado.backend = MODO_DEMO
    ? new BackendDemo({ foto: '../img/demo/atardecer.webp', audio: '../img/demo/nota-de-voz.m4a' })
    : new BackendSupabase();

  let usuario = null;
  try {
    usuario = await estado.backend.iniciar();
  } catch (error) {
    return fallo(error);
  }
  if (!usuario) return mostrar('estado-sin-sesion');
  estado.yo = usuario.id;

  // El mismo PIN del chat: si este dispositivo lo tiene guardado, se pide
  if (tienePin(estado.yo)) return pedirPin();
  cargar();
}

function fallo(error) {
  console.warn('No se pudo abrir la papelera:', error);
  $('#texto-error').textContent = esErrorDeRed(error)
    ? 'Parece que no hay internet. La papelera se ve desde la nube, así que necesita conexión.'
    : error?.message || 'Vuelve a intentar en un momento.';
  mostrar('estado-error');
}

/* ==========================================================================
   PIN (el mismo del chat)
   ========================================================================== */
function pedirPin() {
  mostrar('estado-pin');
  const campo = $('#campo-pin');
  const error = $('#error-pin');
  setTimeout(() => campo.focus(), 60);

  const espera = esperaRestante(estado.yo);
  if (espera > 0) error.textContent = `Espera ${Math.ceil(espera / 60)} minuto(s) antes de volver a intentar.`;

  campo.addEventListener('input', () => {
    campo.value = campo.value.replace(/\D/g, '').slice(0, 4);
    error.textContent = '';
    if (campo.value.length === 4) $('#forma-pin').requestSubmit();
  });

  $('#forma-pin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = campo.value;
    if (pin.length !== 4) {
      error.textContent = 'El PIN tiene 4 números.';
      return;
    }
    let r;
    try {
      r = await verificarPin(estado.yo, pin);
    } catch {
      error.textContent = 'Este navegador no deja comprobar el PIN aquí. Abre la Papelera desde el menú del chat.';
      return;
    }
    if (r.ok) {
      campo.value = '';
      return cargar();
    }
    campo.value = '';
    if (r.esperar) error.textContent = `Demasiados intentos. Espera ${Math.ceil(r.esperar / 60)} minuto(s).`;
    else if (r.bloquear) error.textContent = 'Demasiados intentos. Vuelve a entrar desde el chat.';
    else error.textContent = 'Ese PIN no es.';
    campo.focus();
  });
}

/* ==========================================================================
   Traer la papelera
   ========================================================================== */
async function cargar() {
  mostrar('estado-cargando');
  try {
    const [perfiles, borrados] = await Promise.all([estado.backend.cargarPerfiles(), estado.backend.cargarBorrados()]);
    estado.perfiles = new Map(perfiles.map((p) => [p.id, p]));
    estado.borrados = borrados;
  } catch (error) {
    return fallo(error);
  }

  const total = estado.borrados.length;
  $('#resumen').textContent = total === 0 ? 'Nada eliminado' : total === 1 ? '1 mensaje eliminado' : `${total} mensajes eliminados`;
  if (!total) return mostrar('estado-vacio');

  pintarFiltros();
  pintarLista();
  mostrar('estado-lista');
}

/* ==========================================================================
   Filtros: todos / los míos / los de la pareja
   ========================================================================== */
function pintarFiltros() {
  const parejaId = [...estado.perfiles.keys()].find((id) => id !== estado.yo);
  const opciones = [['todos', 'Todos']];
  if (estado.borrados.some((m) => m.remitente === estado.yo)) opciones.push(['mios', 'Míos']);
  if (parejaId && estado.borrados.some((m) => m.remitente === parejaId)) opciones.push([parejaId, nombreDe(parejaId)]);

  const caja = $('#filtros');
  if (opciones.length < 3) {
    caja.replaceChildren(); // con uno solo no vale la pena el filtro
    return;
  }
  caja.innerHTML = opciones
    .map(([valor, texto]) => `<button type="button" data-valor="${escaparHtml(valor)}" aria-pressed="${valor === estado.filtro}">${escaparHtml(texto)}</button>`)
    .join('');
  caja.addEventListener('click', (e) => {
    const boton = e.target.closest('[data-valor]');
    if (!boton) return;
    estado.filtro = boton.dataset.valor;
    caja.querySelectorAll('[data-valor]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    pintarLista();
  });
}

function filtrados() {
  if (estado.filtro === 'todos') return estado.borrados;
  if (estado.filtro === 'mios') return estado.borrados.filter((m) => m.remitente === estado.yo);
  return estado.borrados.filter((m) => m.remitente === estado.filtro);
}

/* ==========================================================================
   Pintar la lista, agrupada por el día en que se eliminó
   ========================================================================== */
function pintarLista() {
  const lista = $('#lista');
  const mensajes = filtrados();
  if (!mensajes.length) {
    lista.innerHTML = '<p class="papelera-nota">No hay mensajes eliminados de esa persona.</p>';
    return;
  }

  let html = '';
  let diaAnterior = null;
  for (const m of mensajes) {
    const dia = m.borrado_en ? claveDia(m.borrado_en) : 'sin-fecha';
    if (dia !== diaAnterior) {
      diaAnterior = dia;
      const etiqueta = m.borrado_en ? `Eliminado ${etiquetaDia(m.borrado_en).toLowerCase()}` : 'Eliminado hace tiempo';
      html += `<h2 class="papelera-dia">${escaparHtml(etiqueta)}</h2>`;
    }
    html += tarjeta(m);
  }
  lista.innerHTML = html;
  pintarIconos(lista);
  pintarAvatares(lista);
  pintarMedia(lista);
}

function tarjeta(m) {
  const perfil = estado.perfiles.get(m.remitente);
  const quien = m.remitente === estado.yo ? 'Tú' : nombreDe(m.remitente);
  const inicial = (perfil?.nombre || '♥').trim().charAt(0).toUpperCase() || '♥';

  const enviado = m.creado_en ? `Enviado ${etiquetaDia(m.creado_en).toLowerCase()} a las ${hora(m.creado_en)}` : '';
  const eliminado = m.borrado_en ? `Eliminado a las ${hora(m.borrado_en)}` : 'Eliminado';

  return `
    <article class="eliminado">
      <div class="avatar" data-avatar="${escaparHtml(m.remitente)}">${escaparHtml(inicial)}</div>
      <div class="contenido">
        <div class="quien">
          <strong>${escaparHtml(quien)}</strong>
          <span class="cuando" title="${escaparHtml(m.creado_en ? fechaCompleta(m.creado_en) : '')}">${escaparHtml(enviado)}</span>
        </div>
        ${cuerpo(m)}
        <div class="pie">
          <span class="marca-borrado">${icono('basura')}${escaparHtml(eliminado)}</span>
        </div>
      </div>
    </article>`;
}

function cuerpo(m) {
  if (m.tipo === 'te_extrano') return '<p class="texto">💌 Te extraño</p>';
  if (m.tipo === 'imagen') {
    const pie = m.contenido ? `<p class="texto">${textoConEnlaces(m.contenido)}</p>` : '';
    return `${pie}<img class="foto" data-media="${escaparHtml(m.media_path || '')}" alt="Foto eliminada" loading="lazy">`;
  }
  if (m.tipo === 'audio') {
    return `<p class="texto sin-texto">🎤 Nota de voz (${escaparHtml(duracionTexto(m.media_meta?.duracion))})</p>
            <audio controls preload="none" data-media="${escaparHtml(m.media_path || '')}"></audio>`;
  }
  if (!m.contenido) return '<p class="texto sin-texto">Sin texto</p>';
  return `<p class="texto">${textoConEnlaces(m.contenido)}</p>`;
}

/** Las fotos de perfil (se piden aparte porque llevan una dirección firmada). */
function pintarAvatares(raiz) {
  for (const nodo of raiz.querySelectorAll('[data-avatar]')) {
    const ruta = estado.perfiles.get(nodo.dataset.avatar)?.avatar_path;
    if (!ruta) continue;
    estado.backend.urlFirmada(ruta).then((url) => {
      if (!url) return;
      const img = new Image();
      img.alt = '';
      img.onload = () => nodo.replaceChildren(img);
      img.src = url;
    });
  }
}

/** Fotos y notas de voz del mensaje eliminado (direcciones firmadas de 6 h). */
function pintarMedia(raiz) {
  for (const nodo of raiz.querySelectorAll('[data-media]')) {
    const ruta = nodo.dataset.media;
    if (!ruta) {
      nodo.remove();
      continue;
    }
    estado.backend
      .urlFirmada(ruta)
      .then((url) => {
        if (url) nodo.src = url;
        else nodo.remove();
      })
      .catch(() => nodo.remove());
  }
}

/* ========================================================================== */
$('#reintentar').addEventListener('click', () => (estado.yo ? cargar() : iniciar()));
iniciar();
