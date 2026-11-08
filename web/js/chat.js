/* ==========================================================================
   chat.js — La conversación
   --------------------------------------------------------------------------
   · Muestra los mensajes (agrupados por día) y los mantiene al día.
   · Envía texto, fotos, notas de voz y "Te extraño" con una BANDEJA DE
     SALIDA: si no hay señal, los mensajes esperan en el celular y salen
     solos cuando vuelve el internet (nunca se pierden ni se duplican).
   · Sincroniza: al abrir, al volver a la app y en tiempo real.
   · Gestos: mantener presionado = menú, deslizar a la derecha = responder,
     doble toque = ❤️.
   ========================================================================== */
import { icono } from './iconos.js';
import { kv, local } from './almacen.js';
import { comprimirImagen, GrabadoraSimulada, GrabadoraVoz } from './media.js';
import { abrirCapa, abrirVisor, aviso, confirmar, crearElemento, dialogo, hoja, lluviaDeCorazones, sonarMensaje } from './interfaz.js';
import {
  $,
  claveDia,
  contarSoloEmojis,
  duracionTexto,
  esEmojiDeAmor,
  escaparHtml,
  esErrorDeRed,
  etiquetaDia,
  fechaCompleta,
  hora,
  limitar,
  movimientoReducido,
  plataforma,
  recortar,
  retrasar,
  textoConEnlaces,
  textoUltimaVez,
  uuid,
  vibrar,
} from './utilidades.js';

const LIMITE_PAGINA = 40;
const MAX_CACHE = 300;
const MINUTOS_EDICION = 15;
const REACCIONES = ['❤️', '😂', '😮', '😢', '🙏', '🔥'];
const EMOJIS = {
  Amor: '❤️ 💜 🩷 💖 💕 💗 💞 💘 💝 💌 😍 🥰 😘 😚 🤗 🫶 💋 🌹 💐 ✨ ⭐ 🌟 💫 🌙'.split(' '),
  Caritas: '😀 😄 😁 😆 😂 🤣 😊 🙂 😉 😌 😋 😜 🤪 😎 🤩 🥳 😇 🥹 😢 😭 🥺 😤 😡 😴 🤔 🤭 🙈 😳 😱 🙄'.split(' '),
  Gestos: '👍 👎 👏 🙌 🙏 🤝 👋 ✌️ 🤞 🤟 👌 💪 🫂 🔥 🎉 🎂 🍕 🍔 ☕ 🌅 🏖️ 🌊 🎵 📸'.split(' '),
};

let ctx = null;
const el = {};
const nodos = new Map(); // client_id → elemento .fila

function estadoInicial() {
  return {
    abierto: false,
    mensajes: new Map(), // client_id → mensaje
    porId: new Map(), // id del servidor → client_id
    orden: [], // client_id en el orden en que se ven
    ultimaSync: null,
    hayMasAntiguos: true,
    cargandoAntiguos: false,
    listoParaAntiguos: false,
    bandeja: [], // [{ client_id, media, error }]
    procesandoBandeja: false,
    fallosSeguidos: 0,
    pushPendientes: new Set(),
    respondiendoA: null,
    editando: null,
    parejaEnLinea: false,
    presenciaConocida: false,
    escribiendoHasta: 0,
    tipoEscribiendo: 'escribiendo',
    sinLeerAbajo: 0,
    grabadora: null,
    sincronizando: false,
    otraSync: false,
    toque: null,
    teExtranoPendiente: null,
    diaRender: claveDia(Date.now()),
    intervalos: [],
    corte: 0, // ms: lo enviado hasta aquí no se muestra (chat vaciado para los dos o solo para mí)
  };
}
let estado = estadoInicial();
let reproduccion = null; // { cid, audio }
let ultimoGesto = null;
let ultimoMenu = 0;
let tipoPuntero = 'mouse';

/* ---------- Ayudas ---------- */
const esMio = (m) => m.remitente === ctx.yo;
const fechaDe = (m) => m.creado_en || m._creadoLocal;
const luego = (fn) => setTimeout(fn, 60);
const fechaMs = (iso) => Date.parse(iso || '') || 0;

/** Hasta cuándo no se muestran mensajes aquí: el chat vaciado para los dos o "solo para mí". */
function calcularCorte() {
  return Math.max(fechaMs(local.leer(`vaciado:${ctx.yo}`, '')), fechaMs(local.leer(`oculto:${ctx.yo}`, '')));
}
/** ¿Este mensaje quedó antes del corte (no se muestra)? */
const quedoOculto = (f) => !!estado.corte && !!f?.creado_en && fechaMs(f.creado_en) <= estado.corte;

function nombreDe(id) {
  if (id === ctx.yo) return ctx.perfiles.get(id)?.nombre || 'Tú';
  return ctx.perfiles.get(id)?.nombre || 'Tu amor';
}

function resumenMensaje(m) {
  if (!m) return 'Mensaje anterior';
  if (m.borrado) return 'Se eliminó este mensaje';
  if (m.tipo === 'imagen') return m.contenido ? `📷 ${m.contenido}` : '📷 Foto';
  if (m.tipo === 'audio') return `🎤 Nota de voz (${duracionTexto(m.media_meta?.duracion)})`;
  if (m.tipo === 'te_extrano') return '💌 Te extraño';
  return m.contenido || '';
}

function limpiarParaGuardar(m) {
  const { _urlLocal, ...resto } = m;
  return resto;
}

function miniaturaSegura(valor) {
  return typeof valor === 'string' && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(valor) ? valor : null;
}

/* ==========================================================================
   Arranque
   ========================================================================== */
export function iniciarChat(contexto) {
  ctx = contexto;
  if (el.lista) return; // ya enlazado
  Object.assign(el, {
    pantalla: $('#pantalla-chat'),
    avatarPareja: $('#avatar-pareja'),
    puntoLinea: $('#punto-linea'),
    nombrePareja: $('#nombre-pareja'),
    estadoPareja: $('#estado-pareja'),
    avisos: $('#avisos'),
    zona: $('#zona-chat'),
    desplazable: $('#desplazable'),
    lista: $('#lista'),
    sentinela: $('#sentinela'),
    cargandoAntiguos: $('#cargando-antiguos'),
    inicioChat: $('#inicio-chat'),
    tarjetas: $('#tarjetas'),
    mensajes: $('#mensajes'),
    escribiendo: $('#escribiendo'),
    irAbajo: $('#ir-abajo'),
    contadorAbajo: $('#ir-abajo .contador'),
    barraContexto: $('#barra-contexto'),
    panelEmojis: $('#panel-emojis'),
    filaRedactor: $('#fila-redactor'),
    entrada: $('#entrada-mensaje'),
    botonEmojis: $('#boton-emojis'),
    botonFoto: $('#boton-foto'),
    botonCamara: $('#boton-camara'),
    selectorCamara: $('#selector-camara'),
    principal: $('#boton-principal'),
    barraGrabacion: $('#barra-grabacion'),
    reloj: $('#reloj-grabacion'),
    ondaViva: $('#onda-viva'),
    selectorFotos: $('#selector-fotos'),
  });
  enlazarEventos();
}

/** Abre la conversación: muestra lo guardado y se pone al día con el servidor. */
export async function abrirChat() {
  cerrarChat();
  estado = estadoInicial();
  estado.abierto = true;
  estado.corte = calcularCorte();
  el.mensajes.replaceChildren();
  nodos.clear();
  el.entrada.value = local.leer(`borrador:${ctx.yo}`, '') || '';
  el.entrada.enterKeyHint = plataforma().tactil ? 'enter' : 'send';
  ajustarAlturaEntrada();
  actualizarBotonPrincipal();
  actualizarFranjas();
  actualizarCabecera();
  estado.pushPendientes = new Set(local.leer(`push-pendientes:${ctx.yo}`, []));

  ctx.backend.conectarTiempoReal({
    onMensaje: alRecibirMensaje,
    onPresencia: alCambiarPresencia,
    onEscribiendo: alEscribirPareja,
    onChatVaciado: (vaciadoEn, vaciadoPor) => aplicarVaciado(vaciadoEn, vaciadoPor),
    onEstado: (s) => {
      if (s === 'SUBSCRIBED') sincronizar();
    },
  });

  await cargarInicial();

  estado.intervalos.push(
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      actualizarCabecera();
      if (!ctx.backend.tiempoRealActivo()) sincronizar();
    }, 25000),
    setInterval(() => {
      if (document.visibilityState === 'visible') refrescarPerfiles();
    }, 60000),
  );
}

export function cerrarChat() {
  estado.intervalos?.forEach(clearInterval);
  detenerAudio();
  if (estado.grabadora) cancelarGrabacion();
  ctx?.backend?.desconectarTiempoReal?.();
  estado.abierto = false;
}

/* ==========================================================================
   Carga, caché local y sincronización
   ========================================================================== */
async function cargarInicial() {
  const cache = await kv.leer(`cache:${ctx.yo}`);
  if (cache?.mensajes?.length) {
    for (const f of cache.mensajes) aplicarSilencioso(f); // los de antes del corte se saltan solos
    estado.ultimaSync = cache.ultimaSync || estado.ultimaSync;
  }
  await cargarBandeja();
  reconstruirOrden();
  renderizarTodo();
  bajarAlFondo(false);

  try {
    if (estado.ultimaSync) {
      await sincronizar();
    } else {
      const filas = await ctx.backend.cargarMensajes({ limite: 50 });
      estado.hayMasAntiguos = filas.length === 50 && !filas.some(quedoOculto);
      for (const f of filas) aplicarSilencioso(f);
      reconstruirOrden();
      renderizarTodo();
      bajarAlFondo(false);
      guardarCacheRetrasado();
    }
  } catch (error) {
    if (!esErrorDeRed(error)) console.warn('No se pudieron cargar los mensajes:', error);
  }
  await revisarVaciado(); // por si el chat se vació mientras este celular estaba apagado
  actualizarInicioChat();
  setTimeout(() => {
    estado.listoParaAntiguos = true;
  }, 900);
  marcarLeidosSiCorresponde();
  if (!ctx.puedeLeer()) marcarEntregadosRetrasado();
  procesarBandeja();
  reintentarPushes();
}

/** Guarda un mensaje del servidor en memoria, sin tocar la pantalla. */
function aplicarSilencioso(fila) {
  if (!fila?.client_id) return null;
  if (quedoOculto(fila)) {
    actualizarUltimaSync(fila.actualizado_en); // no se muestra, pero ya se revisó: no volver a pedirlo
    return null;
  }
  const cid = fila.client_id;
  const anterior = estado.mensajes.get(cid);
  if (anterior?.actualizado_en && fila.actualizado_en && anterior.actualizado_en > fila.actualizado_en) return anterior;
  const m = { ...fila, _urlLocal: anterior?._urlLocal };
  estado.mensajes.set(cid, m);
  if (m.id) estado.porId.set(m.id, cid);
  actualizarUltimaSync(m.actualizado_en);
  return m;
}

function actualizarUltimaSync(iso) {
  if (iso && (!estado.ultimaSync || iso > estado.ultimaSync)) estado.ultimaSync = iso;
}

const guardarCacheRetrasado = retrasar(async () => {
  if (!estado.abierto) return;
  const confirmados = estado.orden
    .map((c) => estado.mensajes.get(c))
    .filter((m) => m?.id)
    .slice(-MAX_CACHE)
    .map(limpiarParaGuardar);
  await kv.guardar(`cache:${ctx.yo}`, { mensajes: confirmados, ultimaSync: estado.ultimaSync, version: 1 });
}, 1500);

/** Trae todo lo que cambió desde la última vez (nuevos, leídos, editados…). */
export async function sincronizar() {
  if (!estado.abierto) return;
  if (estado.sincronizando) {
    estado.otraSync = true;
    return;
  }
  estado.sincronizando = true;
  try {
    if (!estado.ultimaSync) {
      const filas = await ctx.backend.cargarMensajes({ limite: 50 });
      estado.hayMasAntiguos = filas.length === 50 && !filas.some(quedoOculto);
      aplicarLote(filas);
      return;
    }
    const desde = new Date(Date.parse(estado.ultimaSync) - 3000).toISOString();
    aplicarLote(await ctx.backend.sincronizar(desde));
  } catch (error) {
    if (!esErrorDeRed(error)) console.warn('Error al sincronizar:', error);
  } finally {
    estado.sincronizando = false;
    actualizarFranjas();
    if (estado.otraSync) {
      estado.otraSync = false;
      sincronizar();
    }
  }
}

function aplicarLote(filas) {
  if (!filas?.length) return;
  if (filas.length > 15) {
    const abajo = estaAbajo();
    for (const f of filas) aplicarSilencioso(f);
    reconstruirOrden();
    renderizarTodo({ mantenerPosicion: !abajo });
    if (abajo) bajarAlFondo(false);
    actualizarInicioChat();
    guardarCacheRetrasado();
    if (ctx.puedeLeer()) marcarLeidosSiCorresponde();
    else marcarEntregadosRetrasado();
  } else {
    for (const f of filas) alRecibirMensaje(f, { desdeSync: true });
  }
}

async function cargarAntiguos() {
  if (!estado.listoParaAntiguos || estado.cargandoAntiguos || !estado.hayMasAntiguos) return;
  const masViejo = estado.orden.map((c) => estado.mensajes.get(c)).find((m) => m?.creado_en);
  if (!masViejo) {
    estado.hayMasAntiguos = false;
    actualizarInicioChat();
    return;
  }
  estado.cargandoAntiguos = true;
  el.cargandoAntiguos.hidden = false;
  try {
    const filas = await ctx.backend.cargarMensajes({ antesDe: masViejo.creado_en, limite: LIMITE_PAGINA });
    // Si llegamos al corte, lo de antes ya no se muestra: no hay más que cargar
    if (filas.length < LIMITE_PAGINA || filas.some(quedoOculto)) estado.hayMasAntiguos = false;
    if (filas.length) {
      for (const f of filas) aplicarSilencioso(f);
      reconstruirOrden();
      renderizarTodo({ mantenerPosicion: true });
    }
  } catch (error) {
    if (!esErrorDeRed(error)) console.warn('No se pudieron cargar mensajes anteriores:', error);
  } finally {
    estado.cargandoAntiguos = false;
    el.cargandoAntiguos.hidden = true;
    actualizarInicioChat();
  }
}

/* ==========================================================================
   Tiempo real
   ========================================================================== */
function alRecibirMensaje(fila, { desdeSync = false } = {}) {
  if (!estado.abierto || !fila?.client_id) return;
  if (quedoOculto(fila)) {
    actualizarUltimaSync(fila.actualizado_en); // vaciado (para los dos o solo para mí): no se muestra
    return;
  }
  const cid = fila.client_id;
  const anterior = estado.mensajes.get(cid);
  if (anterior?.actualizado_en && fila.actualizado_en && anterior.actualizado_en > fila.actualizado_en) return;

  // Mi propio mensaje confirmado por el servidor antes de que llegara la respuesta
  if (anterior && !anterior.id) {
    confirmarPendiente(cid, fila);
    return;
  }

  const m = { ...fila, _urlLocal: anterior?._urlLocal };
  estado.mensajes.set(cid, m);
  if (m.id) estado.porId.set(m.id, cid);
  actualizarUltimaSync(m.actualizado_en);

  if (!anterior) {
    insertarNuevo(m);
    if (!esMio(m)) {
      estado.escribiendoHasta = 0;
      pintarEscribiendo();
      const reciente = Date.now() - Date.parse(m.creado_en) < 120000;
      if (reciente) efectosAlRecibir(m, desdeSync);
      if (estaAbajo()) bajarAlFondo(true);
      else {
        estado.sinLeerAbajo += 1;
        actualizarBotonAbajo();
      }
      if (ctx.puedeLeer()) marcarLeidosSiCorresponde();
      else marcarEntregadosRetrasado();
    }
    actualizarInicioChat();
  } else {
    actualizarFila(m, anterior);
  }
  guardarCacheRetrasado();
}

function efectosAlRecibir(m, desdeSync) {
  if (m.borrado) return;
  if (!desdeSync && ctx.puedeVer() && ctx.ajustes().sonido) sonarMensaje();
  if (m.tipo === 'te_extrano') mostrarTeExtrano(m);
  else if (m.tipo === 'texto' && esEmojiDeAmor(m.contenido) && ctx.puedeVer() && !desdeSync) lluviaDeCorazones();
}

function alCambiarPresencia(ids) {
  const pareja = ctx.pareja();
  estado.presenciaConocida = true;
  const enLinea = !!pareja && ids.includes(pareja.id);
  if (enLinea === estado.parejaEnLinea) return;
  estado.parejaEnLinea = enLinea;
  if (!enLinea) setTimeout(refrescarPerfiles, 1500);
  actualizarCabecera();
}

function alEscribirPareja(datos) {
  const pareja = ctx.pareja();
  if (!pareja || datos?.de !== pareja.id) return;
  estado.escribiendoHasta = Date.now() + 4500;
  estado.tipoEscribiendo = datos.tipo === 'grabando' ? 'grabando' : 'escribiendo';
  pintarEscribiendo();
  clearTimeout(estado.temporizadorEscribiendo);
  estado.temporizadorEscribiendo = setTimeout(pintarEscribiendo, 4600);
}

function pintarEscribiendo() {
  const activo = Date.now() < estado.escribiendoHasta;
  const abajo = estaAbajo();
  el.escribiendo.hidden = !activo;
  if (activo && abajo) bajarAlFondo(false);
  actualizarCabecera();
}

/* ==========================================================================
   Cabecera, avisos y estado de la pareja
   ========================================================================== */
function parejaEnLinea() {
  if (estado.presenciaConocida) return estado.parejaEnLinea;
  const p = ctx.pareja();
  return !!(p?.en_app && p.visto_en && Date.now() - Date.parse(p.visto_en) < 45000);
}

export function actualizarCabecera() {
  if (!ctx || !el.nombrePareja) return;
  const p = ctx.pareja();
  const nombre = p?.nombre || 'tu amor';
  // Arriba va la persona con la que hablas (como en WhatsApp); la casilla de
  // escribir lo deja claro para que nadie piense que entró a la otra cuenta.
  el.nombrePareja.textContent = p?.nombre || 'Tu amor';
  el.entrada.placeholder = `Escríbele a ${nombre}…`;
  $('#boton-persona')?.setAttribute('aria-label', `Hablando con ${nombre}. Abrir ajustes`);
  pintarAvatar(el.avatarPareja, p);
  const escribiendo = Date.now() < estado.escribiendoHasta;
  const enLinea = parejaEnLinea();
  let texto = '';
  let clase = '';
  if (escribiendo) {
    texto = estado.tipoEscribiendo === 'grabando' ? 'grabando audio…' : 'escribiendo…';
    clase = 'escribiendo';
  } else if (enLinea) {
    texto = 'en línea';
    clase = 'en-linea';
  } else if (p?.visto_en) {
    texto = textoUltimaVez(p.visto_en);
  }
  el.estadoPareja.textContent = texto;
  el.estadoPareja.className = `estado ${clase}`.trim();
  el.puntoLinea.hidden = !enLinea;
}

/** Pinta la inicial o la foto de perfil dentro de un .avatar */
export function pintarAvatar(nodo, perfil) {
  if (!nodo) return;
  const inicial = (perfil?.nombre || '♥').trim().charAt(0).toUpperCase() || '♥';
  const ruta = perfil?.avatar_path || '';
  if (nodo.dataset.ruta === ruta && nodo.dataset.inicial === inicial) return;
  nodo.dataset.ruta = ruta;
  nodo.dataset.inicial = inicial;
  nodo.textContent = inicial;
  if (!ruta) return;
  ctx.backend.urlFirmada(ruta).then((url) => {
    if (!url || nodo.dataset.ruta !== ruta) return;
    const img = new Image();
    img.alt = '';
    img.onload = () => {
      if (nodo.dataset.ruta === ruta) nodo.replaceChildren(img);
    };
    img.src = url;
  });
}

export async function refrescarPerfiles() {
  if (!ctx?.yo) return;
  try {
    const lista = await ctx.backend.cargarPerfiles();
    for (const p of lista) ctx.perfiles.set(p.id, p);
    kv.guardar(`perfiles:${ctx.yo}`, lista);
    actualizarCabecera();
  } catch {
    /* sin conexión */
  }
}

export function actualizarFranjas() {
  if (!el.avisos) return;
  const partes = [];
  if (ctx?.modoDemo) partes.push(`<div class="franja demo">${icono('destellos')}<span>Vista previa · los mensajes son de ejemplo</span></div>`);
  if (!navigator.onLine) partes.push(`<div class="franja sin-conexion">${icono('sinWifi')}<span>Sin conexión · tus mensajes saldrán cuando vuelva la señal</span></div>`);
  const html = partes.join('');
  if (el.avisos.innerHTML !== html) el.avisos.innerHTML = html;
}

/**
 * Tarjeta destacada arriba de la conversación (por ejemplo, para activar las notificaciones).
 * @param {null | {icono: string, titulo: string, texto: string, boton?: string, alAceptar?: () => void, alCerrar?: () => void}} datos
 */
export function mostrarTarjeta(datos) {
  if (!el.tarjetas) return;
  if (!datos) {
    el.tarjetas.replaceChildren();
    return;
  }
  const tarjeta = crearElemento(`
    <div class="tarjeta-aviso">
      ${icono(datos.icono)}
      <div class="texto-aviso"><strong>${escaparHtml(datos.titulo)}</strong>${escaparHtml(datos.texto)}</div>
      ${datos.boton ? `<button type="button" class="boton" data-aceptar>${escaparHtml(datos.boton)}</button>` : ''}
      <button type="button" class="boton-icono" data-cerrar aria-label="Cerrar aviso">${icono('cerrar')}</button>
    </div>`);
  tarjeta.addEventListener('click', (e) => {
    if (e.target.closest('[data-aceptar]')) datos.alAceptar?.();
    else if (e.target.closest('[data-cerrar]')) {
      tarjeta.remove();
      datos.alCerrar?.();
    }
  });
  el.tarjetas.replaceChildren(tarjeta);
}

function actualizarInicioChat() {
  const sinMensajes = estado.orden.length === 0;
  el.inicioChat.hidden = !(sinMensajes || !estado.hayMasAntiguos);
}

/* ==========================================================================
   Pintar la conversación
   ========================================================================== */
function reconstruirOrden() {
  const todos = [...estado.mensajes.values()];
  const confirmados = todos.filter((m) => m.creado_en).sort((a, b) => (a.creado_en < b.creado_en ? -1 : a.creado_en > b.creado_en ? 1 : 0));
  const pendientes = todos.filter((m) => !m.creado_en).sort((a, b) => (a._creadoLocal < b._creadoLocal ? -1 : 1));
  estado.orden = [...confirmados, ...pendientes].map((m) => m.client_id);
}

function crearSeparador(m) {
  const sep = document.createElement('div');
  sep.className = 'dia';
  sep.setAttribute('role', 'separator');
  sep.textContent = etiquetaDia(fechaDe(m));
  return sep;
}

function capturarAncla() {
  const tope = el.desplazable.getBoundingClientRect().top;
  for (const fila of el.mensajes.querySelectorAll('.fila')) {
    const r = fila.getBoundingClientRect();
    if (r.bottom > tope + 4) return { cid: fila.dataset.cid, desfase: r.top - tope };
  }
  return null;
}

function restaurarAncla(ancla) {
  const fila = ancla && nodos.get(ancla.cid);
  if (!fila) return;
  const tope = el.desplazable.getBoundingClientRect().top;
  el.desplazable.scrollTop += fila.getBoundingClientRect().top - tope - ancla.desfase;
}

function renderizarTodo({ mantenerPosicion = false } = {}) {
  const ancla = mantenerPosicion ? capturarAncla() : null;
  const fragmento = document.createDocumentFragment();
  nodos.clear();
  let previo = null;
  for (const cid of estado.orden) {
    const m = estado.mensajes.get(cid);
    if (!m) continue;
    if (!previo || claveDia(fechaDe(previo)) !== claveDia(fechaDe(m))) fragmento.appendChild(crearSeparador(m));
    const fila = crearFila(m, previo);
    nodos.set(cid, fila);
    fragmento.appendChild(fila);
    previo = m;
  }
  el.mensajes.replaceChildren(fragmento);
  estado.diaRender = claveDia(Date.now());
  if (ancla) restaurarAncla(ancla);
  requestAnimationFrame(ordenarFechasPegadas);
}

/**
 * Las fechas ("Viernes", "Ayer", "Hoy") se quedan pegadas arriba al deslizar.
 * Como todas viven en la misma lista, se apilan: solo se deja ver la del día
 * que se está mirando (la última pegada) y las de abajo se esconden.
 */
function ordenarFechasPegadas() {
  if (!el.desplazable) return;
  const tope = el.desplazable.getBoundingClientRect().top;
  let anterior = null;
  for (const dia of el.mensajes.querySelectorAll('.dia')) {
    const pegada = dia.getBoundingClientRect().top - tope <= 8; // "top: 6px" en el CSS
    dia.classList.remove('tapada');
    if (pegada) {
      anterior?.classList.add('tapada');
      anterior = dia;
    }
  }
}

function insertarNuevo(m) {
  const ultimo = estado.orden.length ? estado.mensajes.get(estado.orden[estado.orden.length - 1]) : null;
  const todosConfirmados = estado.orden.every((c) => estado.mensajes.get(c)?.creado_en);
  if (todosConfirmados && (!ultimo || ultimo.creado_en <= m.creado_en)) {
    estado.orden.push(m.client_id);
    agregarAlFinal(m, { nueva: true });
  } else {
    reconstruirOrden();
    renderizarTodo({ mantenerPosicion: !estaAbajo() });
  }
}

function agregarAlFinal(m, { nueva = false } = {}) {
  const i = estado.orden.indexOf(m.client_id);
  const previo = i > 0 ? estado.mensajes.get(estado.orden[i - 1]) : null;
  if (!previo || claveDia(fechaDe(previo)) !== claveDia(fechaDe(m))) el.mensajes.appendChild(crearSeparador(m));
  const fila = crearFila(m, previo, { nueva });
  nodos.set(m.client_id, fila);
  el.mensajes.appendChild(fila);
  requestAnimationFrame(ordenarFechasPegadas);
}

function anteriorA(cid) {
  const i = estado.orden.indexOf(cid);
  return i > 0 ? estado.mensajes.get(estado.orden[i - 1]) : null;
}

function esSeguido(previo, m) {
  return (
    !!previo &&
    previo.remitente === m.remitente &&
    previo.tipo !== 'te_extrano' &&
    m.tipo !== 'te_extrano' &&
    claveDia(fechaDe(previo)) === claveDia(fechaDe(m)) &&
    Date.parse(fechaDe(m)) - Date.parse(fechaDe(previo)) < 5 * 60000
  );
}

function tamanoFoto(meta) {
  const proporcion = meta?.ancho > 0 && meta?.alto > 0 ? meta.ancho / meta.alto : 4 / 3;
  const disponible = el.lista?.clientWidth || window.innerWidth;
  const maxAncho = Math.min(300, Math.round(disponible * 0.72));
  const ancho = Math.max(150, Math.min(maxAncho, Math.round(360 * proporcion)));
  return { ancho, proporcion };
}

function ticksHtml(m) {
  if (m._estado === 'error') return `<span class="error" title="No se envió">${icono('alerta')}<span class="solo-lector">No se envió</span></span>`;
  if (!m.id) return `<span title="Enviando">${icono('reloj')}<span class="solo-lector">Enviando</span></span>`;
  if (m.leido_en) return `<span class="leido" title="Leído">${icono('checkDoble')}<span class="solo-lector">Leído</span></span>`;
  if (m.entregado_en) return `<span title="Entregado">${icono('checkDoble')}<span class="solo-lector">Entregado</span></span>`;
  return `<span title="Enviado">${icono('check')}<span class="solo-lector">Enviado</span></span>`;
}

function metaInterior(m) {
  const editado = m.editado_en && !m.borrado ? '<span class="editado-txt">editado</span>' : '';
  return `${editado}<span>${hora(fechaDe(m))}</span>${esMio(m) ? ticksHtml(m) : ''}`;
}

function reaccionesHtml(m) {
  const valores = Object.values(m.reacciones || {}).filter(Boolean);
  if (m.borrado || !valores.length) return '';
  const unicos = [...new Set(valores)];
  return `${unicos.map((r) => escaparHtml(r)).join('')}${valores.length > 1 ? `<span class="conteo">${valores.length}</span>` : ''}`;
}

function contenidoBurbuja(m) {
  const mio = esMio(m);
  const clases = ['burbuja'];
  let cuerpo = '';
  let metaSobreMedia = false;

  if (m.borrado) {
    clases.push('borrado');
    cuerpo = `<div class="texto">${icono('prohibido')}${mio ? 'Eliminaste este mensaje' : 'Se eliminó este mensaje'}<span class="espacio-meta" aria-hidden="true"></span></div>`;
  } else if (m.tipo === 'imagen') {
    clases.push('con-media');
    const { ancho, proporcion } = tamanoFoto(m.media_meta);
    const mini = miniaturaSegura(m.media_meta?.miniatura);
    cuerpo = `<button type="button" class="marco-foto" style="width:${ancho}px;aspect-ratio:${proporcion.toFixed(4)};${mini ? `background-image:url('${mini}')` : ''}" aria-label="Ver foto"><img alt="Foto" decoding="async" draggable="false">${!m.id ? '<span class="progreso-subida">Enviando…</span>' : ''}</button>`;
    if (m.contenido) cuerpo += `<div class="texto">${textoConEnlaces(m.contenido)}<span class="espacio-meta" aria-hidden="true"></span></div>`;
    else metaSobreMedia = true;
  } else if (m.tipo === 'audio') {
    const onda = Array.isArray(m.media_meta?.onda) && m.media_meta.onda.length ? m.media_meta.onda : Array(40).fill(22);
    const barras = onda.map((v) => `<i style="height:${Math.max(8, Math.min(100, Number(v) || 0))}%"></i>`).join('');
    cuerpo = `
      <div class="nota-voz">
        <button type="button" class="boton-play" aria-label="Reproducir nota de voz">${icono('play')}</button>
        <div class="onda" role="slider" tabindex="0" aria-label="Avance de la nota de voz" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${barras}</div>
        <button type="button" class="velocidad" aria-label="Cambiar velocidad">${velocidadTexto()}</button>
      </div>
      <span class="tiempo">${duracionTexto(m.media_meta?.duracion)}</span>`;
  } else if (m.tipo === 'te_extrano') {
    clases.push('te-extrano');
    const pareja = ctx.pareja();
    cuerpo = `
      <span class="sobre" aria-hidden="true">${icono('carta')}</span>
      <span class="frase">Te extraño</span>
      <span class="detalle">${mio ? `Para ${escaparHtml(pareja?.nombre || 'tu amor')}` : `De ${escaparHtml(nombreDe(m.remitente))}`}</span>`;
  } else {
    const n = contarSoloEmojis(m.contenido);
    if (n) {
      clases.push('solo-emoji');
      if (n === 1) clases.push('uno');
      cuerpo = `<div class="texto">${escaparHtml(m.contenido)}</div>`;
    } else {
      cuerpo = `<div class="texto">${textoConEnlaces(m.contenido)}<span class="espacio-meta" aria-hidden="true"></span></div>`;
    }
  }

  if (m.editado_en && !m.borrado) clases.push('editado');

  let cita = '';
  if (m.responde_a && !m.borrado) {
    const cidOriginal = estado.porId.get(m.responde_a);
    const original = cidOriginal ? estado.mensajes.get(cidOriginal) : null;
    const autor = original ? (esMio(original) ? 'Tú' : nombreDe(original.remitente)) : 'Mensaje anterior';
    cita = `<button type="button" class="cita" data-ir="${escaparHtml(m.responde_a)}"><span class="autor">${escaparHtml(autor)}</span><span class="resumen">${escaparHtml(recortar(original ? resumenMensaje(original) : 'Toca para verlo', 140))}</span></button>`;
  }

  return `
    <div class="${clases.join(' ')}" data-cid="${escaparHtml(m.client_id)}">
      <button type="button" class="abrir-menu" aria-label="Opciones del mensaje">${icono('abajo')}</button>
      ${cita}${cuerpo}
      <span class="meta${metaSobreMedia ? ' sobre-media' : ''}">${metaInterior(m)}</span>
    </div>`;
}

function crearFila(m, previo, { nueva = false } = {}) {
  const fila = document.createElement('div');
  fila.className = `fila ${esMio(m) ? 'mia' : 'suya'}${esSeguido(previo, m) ? ' seguido' : ''}`;
  fila.dataset.cid = m.client_id;
  fila.innerHTML = `<span class="icono-deslizar" aria-hidden="true">${icono('responder')}</span>${contenidoBurbuja(m)}`;
  if (nueva) fila.querySelector('.burbuja').classList.add('nueva');
  pintarReacciones(fila, m);
  cargarFotoEn(fila, m);
  if (reproduccion?.cid === m.client_id) pintarBotonPlay(m.client_id, !reproduccion.audio.paused);
  return fila;
}

function pintarReacciones(fila, m) {
  if (!fila) return;
  const burbuja = fila.querySelector('.burbuja');
  let chip = burbuja.querySelector('.reacciones');
  const html = reaccionesHtml(m);
  if (!html) {
    chip?.remove();
    fila.classList.remove('con-reacciones');
    return;
  }
  if (!chip) {
    chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'reacciones';
    chip.setAttribute('aria-label', 'Reacciones');
    burbuja.appendChild(chip);
  }
  chip.innerHTML = html;
  fila.classList.add('con-reacciones');
}

async function cargarFotoEn(fila, m) {
  if (m.borrado || m.tipo !== 'imagen') return;
  const img = fila.querySelector('.marco-foto img');
  if (!img) return;
  const url = m._urlLocal || (m.media_path ? await ctx.backend.urlFirmada(m.media_path) : null);
  if (!url) return;
  img.onload = () => img.classList.add('cargada');
  img.onerror = () => img.remove();
  img.src = url;
}

/** Actualiza una fila que ya está en pantalla tocando solo lo que cambió. */
function actualizarFila(m, anterior) {
  const fila = nodos.get(m.client_id);
  if (!fila) return;
  const cambiaForma =
    !anterior ||
    anterior.borrado !== m.borrado ||
    anterior.tipo !== m.tipo ||
    (m.tipo === 'texto' && anterior.contenido !== m.contenido && (contarSoloEmojis(anterior.contenido) > 0) !== (contarSoloEmojis(m.contenido) > 0));
  if (cambiaForma) {
    if (reproduccion?.cid === m.client_id && m.borrado) detenerAudio();
    const nueva = crearFila(m, anteriorA(m.client_id));
    fila.replaceWith(nueva);
    nodos.set(m.client_id, nueva);
    return;
  }
  const burbuja = fila.querySelector('.burbuja');
  if (m.tipo === 'texto' && anterior.contenido !== m.contenido) {
    const texto = burbuja.querySelector('.texto');
    if (texto) {
      texto.innerHTML = contarSoloEmojis(m.contenido)
        ? escaparHtml(m.contenido)
        : `${textoConEnlaces(m.contenido)}<span class="espacio-meta" aria-hidden="true"></span>`;
    }
  }
  burbuja.classList.toggle('editado', !!m.editado_en && !m.borrado);
  const meta = burbuja.querySelector('.meta');
  if (meta) meta.innerHTML = metaInterior(m);
  if (m.id) burbuja.querySelector('.progreso-subida')?.remove();
  pintarReacciones(fila, m);
}

/* ==========================================================================
   Desplazamiento
   ========================================================================== */
const distanciaAlFondo = () => el.desplazable.scrollHeight - el.desplazable.scrollTop - el.desplazable.clientHeight;
const estaAbajo = () => distanciaAlFondo() < 160;

function bajarAlFondo(suave = false) {
  requestAnimationFrame(() => {
    el.desplazable.scrollTo({ top: el.desplazable.scrollHeight, behavior: suave && !movimientoReducido() ? 'smooth' : 'auto' });
  });
  estado.sinLeerAbajo = 0;
  actualizarBotonAbajo();
}

function actualizarBotonAbajo() {
  el.contadorAbajo.hidden = estado.sinLeerAbajo === 0;
  el.contadorAbajo.textContent = estado.sinLeerAbajo > 99 ? '99+' : String(estado.sinLeerAbajo);
}

/* ==========================================================================
   Leídos y entregados
   ========================================================================== */
const marcarLeidosRetrasado = retrasar(async () => {
  if (!estado.abierto || !ctx.puedeLeer()) return;
  const pendientes = [...estado.mensajes.values()].filter((m) => m.id && !esMio(m) && !m.leido_en);
  if (!pendientes.length) {
    ctx.borrarInsignia?.();
    return;
  }
  try {
    await ctx.backend.marcarLeidos();
    const ahora = new Date().toISOString();
    for (const m of pendientes) {
      m.leido_en = ahora;
      m.entregado_en = m.entregado_en || ahora;
    }
    ctx.borrarInsignia?.();
  } catch {
    /* se reintenta en la próxima ocasión */
  }
}, 450);

export function marcarLeidosSiCorresponde() {
  if (estado.abierto && ctx?.puedeLeer()) marcarLeidosRetrasado();
}

const marcarEntregadosRetrasado = retrasar(async () => {
  if (!estado.abierto) return;
  const hay = [...estado.mensajes.values()].some((m) => m.id && !esMio(m) && !m.entregado_en);
  if (!hay) return;
  try {
    await ctx.backend.marcarEntregados();
    const ahora = new Date().toISOString();
    for (const m of estado.mensajes.values()) if (m.id && !esMio(m) && !m.entregado_en) m.entregado_en = ahora;
  } catch {
    /* nada */
  }
}, 600);

/* ==========================================================================
   Enviar: bandeja de salida
   ========================================================================== */
const claveBandeja = () => `bandeja:${ctx.yo}`;

async function guardarBandeja() {
  const datos = estado.bandeja
    .map((item) => {
      const m = estado.mensajes.get(item.client_id);
      if (!m) return null;
      const media = item.media
        ? { tipo: item.media.tipo, ext: item.media.ext, rutaDemo: item.media.rutaDemo, buffer: item.media.buffer }
        : null;
      return { mensaje: limpiarParaGuardar(m), media, error: !!item.error };
    })
    .filter(Boolean);
  await kv.guardar(claveBandeja(), datos);
}

async function cargarBandeja() {
  const datos = (await kv.leer(claveBandeja())) || [];
  for (const { mensaje, media, error } of datos) {
    const existente = estado.mensajes.get(mensaje.client_id);
    if (existente?.id) continue; // ya llegó al servidor
    const m = { ...mensaje, _estado: error ? 'error' : 'pendiente' };
    if (media?.buffer) m._urlLocal = URL.createObjectURL(new Blob([media.buffer], { type: media.tipo }));
    estado.mensajes.set(m.client_id, m);
    estado.bandeja.push({ client_id: m.client_id, media, error: !!error });
  }
}

/**
 * Crea el mensaje en pantalla al instante y lo pone en la bandeja de salida.
 * @param {object} campos  tipo, contenido, media_meta
 * @param {null|{buffer?: ArrayBuffer, tipo?: string, ext?: string, urlLocal?: string, rutaDemo?: string}} media
 */
function crearYEncolar(campos, media = null) {
  const m = {
    id: null,
    client_id: uuid(),
    remitente: ctx.yo,
    tipo: campos.tipo,
    contenido: campos.contenido ?? null,
    media_path: null,
    media_meta: campos.media_meta ?? null,
    // Si quien llama dice explícitamente "sin respuesta" (null), se respeta
    responde_a: 'responde_a' in campos ? campos.responde_a : (estado.respondiendoA?.id ?? null),
    reacciones: {},
    editado_en: null,
    borrado: false,
    entregado_en: null,
    leido_en: null,
    creado_en: null,
    actualizado_en: null,
    _estado: 'pendiente',
    _creadoLocal: new Date().toISOString(),
    _urlLocal: media?.urlLocal || null,
  };
  cancelarContexto();
  estado.mensajes.set(m.client_id, m);
  estado.orden.push(m.client_id);
  agregarAlFinal(m, { nueva: true });
  actualizarInicioChat();
  bajarAlFondo(true);
  // En memoria se guarda el Blob; en el dispositivo, un ArrayBuffer (más compatible con iPhone)
  const itemMedia = media
    ? { tipo: media.tipo || null, ext: media.ext || null, rutaDemo: media.rutaDemo || null, buffer: media.buffer || null, blob: media.blobPendiente || null }
    : null;
  estado.bandeja.push({ client_id: m.client_id, media: itemMedia, error: false });
  guardarBandeja();
  if (itemMedia?.blob && !itemMedia.buffer) {
    itemMedia.blob
      .arrayBuffer()
      .then((buffer) => {
        itemMedia.buffer = buffer;
        guardarBandeja();
      })
      .catch(() => {});
  }
  procesarBandeja();
  if (m.tipo === 'texto' && esEmojiDeAmor(m.contenido)) lluviaDeCorazones();
  return m;
}

let temporizadorReintento = null;
function programarReintento() {
  clearTimeout(temporizadorReintento);
  const espera = Math.min(30000, 1500 * 2 ** estado.fallosSeguidos);
  temporizadorReintento = setTimeout(procesarBandeja, espera);
}

export async function procesarBandeja() {
  if (!estado.abierto || estado.procesandoBandeja) return;
  estado.procesandoBandeja = true;
  try {
    for (;;) {
      const item = estado.bandeja.find((b) => !b.error);
      if (!item) break;
      if (!navigator.onLine && ctx.backend.modo !== 'demo') break;
      const m = estado.mensajes.get(item.client_id);
      if (!m || m.id) {
        estado.bandeja = estado.bandeja.filter((b) => b !== item);
        continue;
      }
      try {
        if (item.media && !m.media_path) {
          if (item.media.rutaDemo) m.media_path = item.media.rutaDemo;
          else {
            const archivo = item.media.blob || (item.media.buffer ? new Blob([item.media.buffer], { type: item.media.tipo }) : null);
            if (!archivo) throw Object.assign(new Error('El archivo ya no está disponible en este dispositivo.'), { status: 400 });
            const ruta = `${ctx.yo}/${m.client_id}.${item.media.ext}`;
            await ctx.backend.subirMedia(archivo, ruta, item.media.tipo);
            m.media_path = ruta;
          }
          await guardarBandeja();
        }
        const fila = await ctx.backend.enviarMensaje({
          client_id: m.client_id,
          remitente: ctx.yo,
          tipo: m.tipo,
          contenido: m.contenido ?? null,
          media_path: m.media_path ?? null,
          media_meta: m.media_meta ?? null,
          responde_a: m.responde_a ?? null,
        });
        estado.bandeja = estado.bandeja.filter((b) => b.client_id !== m.client_id);
        estado.fallosSeguidos = 0;
        await guardarBandeja();
        confirmarPendiente(m.client_id, fila);
        enviarPush(fila.id);
      } catch (error) {
        console.warn('No se pudo enviar el mensaje:', error);
        if (esErrorDeRed(error) && estado.fallosSeguidos < 8) {
          estado.fallosSeguidos += 1;
          programarReintento();
          break;
        }
        item.error = true;
        m._estado = 'error';
        actualizarFila(m, m);
        await guardarBandeja();
        aviso('Un mensaje no se pudo enviar. Tócalo para reintentar.');
      }
    }
  } finally {
    estado.procesandoBandeja = false;
  }
}

function confirmarPendiente(cid, fila) {
  const anterior = estado.mensajes.get(cid);
  const m = { ...fila, _urlLocal: anterior?._urlLocal };
  estado.mensajes.set(cid, m);
  if (m.id) estado.porId.set(m.id, cid);
  actualizarUltimaSync(m.actualizado_en);
  const i = estado.orden.indexOf(cid);
  const previo = i > 0 ? estado.mensajes.get(estado.orden[i - 1]) : null;
  const siguiente = i >= 0 && i < estado.orden.length - 1 ? estado.mensajes.get(estado.orden[i + 1]) : null;
  const enSuSitio =
    i >= 0 && (!previo?.creado_en || previo.creado_en <= m.creado_en) && (!siguiente?.creado_en || siguiente.creado_en >= m.creado_en);
  if (!nodos.has(cid) || !enSuSitio) {
    reconstruirOrden();
    renderizarTodo({ mantenerPosicion: !estaAbajo() });
  } else {
    actualizarFila(m, anterior);
  }
  guardarCacheRetrasado();
}

function reintentarEnvio(cid) {
  const item = estado.bandeja.find((b) => b.client_id === cid);
  const m = estado.mensajes.get(cid);
  if (!item || !m) return;
  item.error = false;
  m._estado = 'pendiente';
  estado.fallosSeguidos = 0;
  actualizarFila(m, m);
  guardarBandeja();
  procesarBandeja();
}

function descartarEnvio(cid) {
  estado.bandeja = estado.bandeja.filter((b) => b.client_id !== cid);
  estado.mensajes.delete(cid);
  estado.orden = estado.orden.filter((c) => c !== cid);
  guardarBandeja();
  renderizarTodo({ mantenerPosicion: true });
  actualizarInicioChat();
}

/* ---------- Avisos push al otro celular ---------- */
async function enviarPush(id) {
  if (!id || ctx.backend.modo === 'demo') return;
  const guardar = () => local.guardar(`push-pendientes:${ctx.yo}`, [...estado.pushPendientes]);
  estado.pushPendientes.add(id);
  // Máximo 30 pendientes: los más viejos ya no valen la pena
  while (estado.pushPendientes.size > 30) estado.pushPendientes.delete(estado.pushPendientes.values().next().value);
  guardar();
  try {
    await ctx.backend.notificarPush(id);
    estado.pushPendientes.delete(id);
    guardar();
  } catch (error) {
    // 4xx (función sin publicar, mensaje ajeno, datos malos…) no se arregla reintentando.
    // 401 (sesión renovándose) y 429 (demasiadas peticiones) sí se reintentan.
    const http = error?.context?.status;
    if (http >= 400 && http < 500 && http !== 401 && http !== 429) {
      estado.pushPendientes.delete(id);
      guardar();
    }
    console.warn('El aviso push quedó pendiente:', error);
  }
}

export function reintentarPushes() {
  if (!estado.abierto) return;
  for (const id of [...estado.pushPendientes]) enviarPush(id);
}

/* ==========================================================================
   Redactor
   ========================================================================== */
function ajustarAlturaEntrada() {
  const t = el.entrada;
  t.style.height = 'auto';
  // Si la pantalla aún está oculta, scrollHeight vale 0: se deja el alto natural
  if (t.scrollHeight > 0) t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  else t.style.height = '';
}

function actualizarBotonPrincipal() {
  const hayTexto = el.entrada.value.trim().length > 0;
  let nombre = 'microfono';
  let etiqueta = 'Grabar nota de voz';
  if (estado.editando) {
    nombre = 'check';
    etiqueta = 'Guardar cambios';
  } else if (hayTexto) {
    nombre = 'enviar';
    etiqueta = 'Enviar mensaje';
  }
  if (el.principal.dataset.modo !== nombre) {
    el.principal.dataset.modo = nombre;
    el.principal.innerHTML = icono(nombre);
    el.principal.setAttribute('aria-label', etiqueta);
  }
}

const guardarBorrador = retrasar(() => local.guardar(`borrador:${ctx.yo}`, el.entrada.value), 500);
const avisarEscribiendo = limitar(() => ctx.backend.enviarEscribiendo('escribiendo'), 2500);
const avisarGrabando = limitar(() => ctx.backend.enviarEscribiendo('grabando'), 2500);

function enviarDesdeRedactor() {
  const texto = el.entrada.value.trim();
  if (estado.editando) {
    if (texto) guardarEdicion(texto);
    return;
  }
  if (!texto) return;
  el.entrada.value = '';
  local.guardar(`borrador:${ctx.yo}`, '');
  ajustarAlturaEntrada();
  actualizarBotonPrincipal();
  cerrarEmojis();
  crearYEncolar({ tipo: 'texto', contenido: texto.slice(0, 5000) });
}

function mostrarBarraContexto(titulo, texto) {
  el.barraContexto.innerHTML = `
    <div class="barra-contexto">
      <div class="contenido"><span class="titulo-ctx">${escaparHtml(titulo)}</span><span class="resumen">${escaparHtml(recortar(texto, 120))}</span></div>
      <button type="button" class="boton-icono" data-cancelar aria-label="Cancelar">${icono('cerrar')}</button>
    </div>`;
}

function cancelarContexto() {
  const estabaEditando = !!estado.editando;
  estado.respondiendoA = null;
  estado.editando = null;
  el.barraContexto.replaceChildren();
  if (estabaEditando) {
    el.entrada.value = '';
    ajustarAlturaEntrada();
  }
  actualizarBotonPrincipal();
}

function responderA(cid) {
  const m = estado.mensajes.get(cid);
  if (!m?.id || m.borrado) return;
  estado.editando = null;
  estado.respondiendoA = m;
  mostrarBarraContexto(`Respondiendo a ${esMio(m) ? 'ti' : nombreDe(m.remitente)}`, resumenMensaje(m));
  actualizarBotonPrincipal();
  el.entrada.focus();
}

function iniciarEdicion(m) {
  estado.respondiendoA = null;
  estado.editando = m;
  mostrarBarraContexto('Editando mensaje', m.contenido);
  el.entrada.value = m.contenido;
  ajustarAlturaEntrada();
  actualizarBotonPrincipal();
  el.entrada.focus();
}

async function guardarEdicion(texto) {
  const m = estado.editando;
  estado.editando = null;
  el.barraContexto.replaceChildren();
  el.entrada.value = '';
  ajustarAlturaEntrada();
  actualizarBotonPrincipal();
  if (!m || texto === m.contenido) return;
  const original = estado.mensajes.get(m.client_id);
  const editado = { ...original, contenido: texto, editado_en: new Date().toISOString() };
  estado.mensajes.set(m.client_id, editado);
  actualizarFila(editado, original);
  try {
    await ctx.backend.editar(m.id, texto);
  } catch (error) {
    estado.mensajes.set(m.client_id, original);
    actualizarFila(original, editado);
    aviso(!esErrorDeRed(error) && error?.message ? error.message : 'Sin conexión: no se pudo editar.');
  }
}

/* ---------- Emojis ---------- */
function alternarEmojis() {
  if (!el.panelEmojis.hidden) return cerrarEmojis();
  el.panelEmojis.innerHTML = Object.entries(EMOJIS)
    .map(
      ([grupo, lista]) =>
        `<h3>${grupo}</h3><div class="rejilla-emojis">${lista.map((e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`,
    )
    .join('');
  el.panelEmojis.hidden = false;
}

function cerrarEmojis() {
  el.panelEmojis.hidden = true;
}

function insertarEnEntrada(texto) {
  const t = el.entrada;
  const inicio = t.selectionStart ?? t.value.length;
  const fin = t.selectionEnd ?? t.value.length;
  t.value = t.value.slice(0, inicio) + texto + t.value.slice(fin);
  const pos = inicio + texto.length;
  try {
    t.setSelectionRange(pos, pos);
  } catch {
    /* nada */
  }
  ajustarAlturaEntrada();
  actualizarBotonPrincipal();
  guardarBorrador();
}

/* ---------- Fotos ---------- */
async function abrirPreviaFotos(archivos) {
  const lista = [...archivos].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name)).slice(0, 10);
  if (!lista.length) return;
  const urls = lista.map((f) => URL.createObjectURL(f));
  const capa = crearElemento(`
    <div class="previa-fotos" role="dialog" aria-modal="true" aria-label="Enviar fotos">
      <div class="barra-superior">
        <button type="button" class="boton-icono" data-cerrar aria-label="Cancelar">${icono('cerrar')}</button>
        <div class="titulo">${lista.length === 1 ? 'Enviar foto' : `Enviar ${lista.length} fotos`}</div>
      </div>
      <div class="foto-grande"><img alt="Foto seleccionada" src="${urls[0]}"></div>
      ${
        lista.length > 1
          ? `<div class="miniaturas">${urls.map((u, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}" aria-label="Foto ${i + 1}"><img alt="" src="${u}"></button>`).join('')}</div>`
          : ''
      }
      <div class="pie">
        <div class="campo-mensaje"><label for="pie-foto" class="solo-lector">Mensaje para la foto</label><textarea id="pie-foto" rows="1" maxlength="1000" placeholder="Agrega un mensaje…"></textarea></div>
        <button type="button" class="boton-principal" data-enviar aria-label="Enviar">${icono('enviar')}</button>
      </div>
    </div>`);
  const cerrar = abrirCapa(capa, () => urls.forEach((u) => URL.revokeObjectURL(u)));
  const grande = capa.querySelector('.foto-grande img');
  capa.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cerrar]')) return cerrar();
    const mini = e.target.closest('[data-i]');
    if (mini) {
      grande.src = urls[Number(mini.dataset.i)];
      capa.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-pressed', String(b === mini)));
      return;
    }
    const enviar = e.target.closest('[data-enviar]');
    if (!enviar || enviar.disabled) return;
    enviar.disabled = true;
    enviar.innerHTML = '…';
    const pie = capa.querySelector('#pie-foto').value.trim();
    const respuesta = estado.respondiendoA?.id ?? null;
    try {
      const preparadas = [];
      for (const archivo of lista) preparadas.push(await comprimirImagen(archivo));
      cerrar();
      preparadas.forEach((r, i) => {
        crearYEncolar(
          {
            tipo: 'imagen',
            contenido: i === 0 && pie ? pie : null,
            media_meta: { ancho: r.ancho, alto: r.alto, miniatura: r.miniatura },
            responde_a: i === 0 ? respuesta : null,
          },
          { blobPendiente: r.blob, tipo: r.tipo, ext: r.ext, urlLocal: URL.createObjectURL(r.blob) },
        );
      });
    } catch (error) {
      enviar.disabled = false;
      enviar.innerHTML = icono('enviar');
      aviso(error?.message || 'No se pudo preparar la foto.');
    }
  });
}

/* ---------- Notas de voz: grabar ---------- */
async function iniciarGrabacion() {
  if (estado.grabadora) return;
  let Clase = null;
  if (ctx.esVistaPrevia) Clase = GrabadoraSimulada;
  else if (GrabadoraVoz.soportada()) Clase = GrabadoraVoz;
  if (!Clase) {
    aviso('Este navegador no permite grabar audio.');
    return;
  }
  cerrarEmojis();
  const grabadora = new Clase();
  estado.grabadora = grabadora;
  el.ondaViva.replaceChildren();
  el.reloj.textContent = '0:00';
  el.filaRedactor.hidden = true;
  el.barraGrabacion.hidden = false;
  try {
    await grabadora.iniciar(
      (nivel) => {
        const barra = document.createElement('i');
        barra.style.height = `${Math.max(16, Math.round(nivel * 100))}%`;
        el.ondaViva.appendChild(barra);
        while (el.ondaViva.children.length > 60) el.ondaViva.firstElementChild.remove();
      },
      () => enviarGrabacion(),
    );
  } catch (error) {
    terminarUiGrabacion();
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      aviso('Necesito permiso para usar el micrófono. Actívalo en los ajustes del navegador.', { duracion: 5000 });
    } else {
      aviso('No se pudo empezar a grabar. Revisa el micrófono.');
    }
    return;
  }
  vibrar(18);
  estado.relojGrabacion = setInterval(() => {
    el.reloj.textContent = duracionTexto(grabadora.segundos());
    avisarGrabando();
  }, 250);
}

function terminarUiGrabacion() {
  clearInterval(estado.relojGrabacion);
  estado.grabadora = null;
  el.barraGrabacion.hidden = true;
  el.filaRedactor.hidden = false;
}

function cancelarGrabacion() {
  estado.grabadora?.cancelar();
  terminarUiGrabacion();
}

async function enviarGrabacion() {
  const grabadora = estado.grabadora;
  if (!grabadora) return;
  if (grabadora.segundos() < 0.7) {
    cancelarGrabacion();
    aviso('La nota quedó muy corta. Graba un poquito más.');
    return;
  }
  terminarUiGrabacion();
  try {
    const r = await grabadora.detener();
    const media = r.blob
      ? { blobPendiente: r.blob, tipo: r.tipo, ext: r.ext, urlLocal: URL.createObjectURL(r.blob) }
      : { rutaDemo: r.rutaDemo };
    crearYEncolar({ tipo: 'audio', media_meta: { duracion: r.duracion, onda: r.onda } }, media);
  } catch (error) {
    aviso(error?.message || 'No se pudo guardar la nota de voz.');
  }
}

/* ---------- Notas de voz: escuchar ---------- */
const VELOCIDADES = [1, 1.5, 2];
const velocidadActual = () => {
  const v = Number(local.leer('velocidad-audio', 1));
  return VELOCIDADES.includes(v) ? v : 1;
};
const velocidadTexto = () => `${String(velocidadActual()).replace('.', ',')}×`;

function cambiarVelocidad() {
  const actual = velocidadActual();
  const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(actual) + 1) % VELOCIDADES.length];
  ctx.guardarPreferencia('velocidad-audio', siguiente);
  if (reproduccion) reproduccion.audio.playbackRate = siguiente;
  el.mensajes.querySelectorAll('.velocidad').forEach((b) => {
    b.textContent = velocidadTexto();
  });
}

function pintarBotonPlay(cid, sonando) {
  const boton = nodos.get(cid)?.querySelector('.boton-play');
  if (!boton) return;
  boton.innerHTML = icono(sonando ? 'pausa' : 'play');
  boton.setAttribute('aria-label', sonando ? 'Pausar nota de voz' : 'Reproducir nota de voz');
}

function pintarProgreso(cid, audio, terminado = false) {
  const fila = nodos.get(cid);
  if (!fila) return;
  const m = estado.mensajes.get(cid);
  const total = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : m?.media_meta?.duracion || 1;
  const avance = terminado ? 0 : Math.min(1, audio.currentTime / total);
  const barras = fila.querySelectorAll('.onda i');
  const n = Math.round(avance * barras.length);
  barras.forEach((b, i) => b.classList.toggle('oida', i < n));
  const tiempo = fila.querySelector('.tiempo');
  if (tiempo) tiempo.textContent = duracionTexto(terminado ? total : audio.currentTime);
  fila.querySelector('.onda')?.setAttribute('aria-valuenow', String(Math.round(avance * 100)));
}

function detenerAudio() {
  if (!reproduccion) return;
  const { audio, cid } = reproduccion;
  reproduccion = null;
  audio.pause();
  audio.removeAttribute('src');
  pintarBotonPlay(cid, false);
}

async function alternarAudio(cid, saltarA = null) {
  const m = estado.mensajes.get(cid);
  if (!m || m.borrado) return;
  if (reproduccion?.cid === cid) {
    const a = reproduccion.audio;
    if (saltarA !== null) {
      const total = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : m.media_meta?.duracion || 0;
      a.currentTime = saltarA * total;
      pintarProgreso(cid, a);
      return;
    }
    if (a.paused) a.play().catch(() => {});
    else a.pause();
    return;
  }
  detenerAudio();
  const url = m._urlLocal || (await ctx.backend.urlFirmada(m.media_path));
  if (!url) {
    aviso('No se pudo cargar la nota de voz.');
    return;
  }
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  audio.playbackRate = velocidadActual();
  reproduccion = { cid, audio };
  audio.addEventListener('play', () => pintarBotonPlay(cid, true));
  audio.addEventListener('pause', () => pintarBotonPlay(cid, false));
  audio.addEventListener('timeupdate', () => pintarProgreso(cid, audio));
  audio.addEventListener('loadedmetadata', () => {
    audio.playbackRate = velocidadActual();
    if (saltarA !== null && Number.isFinite(audio.duration)) audio.currentTime = saltarA * audio.duration;
  });
  audio.addEventListener('ended', () => {
    pintarProgreso(cid, audio, true);
    pintarBotonPlay(cid, false);
    if (reproduccion?.cid === cid) reproduccion = null;
  });
  audio.addEventListener('error', () => {
    if (reproduccion?.cid !== cid) return;
    aviso('Esta nota de voz no se puede reproducir en este dispositivo.');
    detenerAudio();
  });
  try {
    await audio.play();
  } catch (error) {
    if (error?.name !== 'AbortError') aviso('Toca de nuevo para escuchar.');
  }
}

/* ==========================================================================
   "Te extraño"
   ========================================================================== */
let temporizadorEnfriamiento = null;
function pintarEnfriamiento() {
  const boton = $('#boton-te-extrano');
  if (!boton) return;
  const restante = local.leer('te-extrano-hasta', 0) - Date.now();
  boton.classList.toggle('enfriando', restante > 0);
  clearTimeout(temporizadorEnfriamiento);
  if (restante > 0) temporizadorEnfriamiento = setTimeout(pintarEnfriamiento, restante + 50);
}

export function enviarTeExtrano() {
  const restante = local.leer('te-extrano-hasta', 0) - Date.now();
  if (restante > 0) {
    aviso(`Espera ${Math.ceil(restante / 1000)} s para mandar otro 💌`);
    return;
  }
  local.guardar('te-extrano-hasta', Date.now() + 30000);
  pintarEnfriamiento();
  crearYEncolar({ tipo: 'te_extrano', responde_a: null });
  vibrar([30, 40, 30]);
  lluviaDeCorazones(['💌', '❤️', '💜']);
  aviso(`Le enviaste un “Te extraño” a ${ctx.pareja()?.nombre || 'tu amor'} 💌`);
}

function mostrarTeExtrano(m) {
  if (!ctx.puedeVer()) {
    estado.teExtranoPendiente = m;
    return;
  }
  estado.teExtranoPendiente = null;
  vibrar([120, 60, 120, 60, 300]);
  lluviaDeCorazones(['❤️', '💌', '💜', '💕']);
  const capa = crearElemento(`
    <div class="capa-te-extrano" role="dialog" aria-modal="true" aria-labelledby="titulo-te-extrano">
      <div class="tarjeta">
        <span class="sobre" aria-hidden="true">${icono('carta')}</span>
        <h2 id="titulo-te-extrano">Te extraño</h2>
        <p>${escaparHtml(nombreDe(m.remitente))} te está pensando ahora mismo</p>
        <div class="botones">
          <button type="button" class="boton" data-responder>Responder con un ❤️</button>
          <button type="button" class="boton fantasma" data-cerrar>Cerrar</button>
        </div>
      </div>
    </div>`);
  const cerrar = abrirCapa(capa);
  capa.addEventListener('click', (e) => {
    if (e.target.closest('[data-responder]')) {
      cerrar();
      crearYEncolar({ tipo: 'texto', contenido: '❤️', responde_a: null });
    } else if (e.target.closest('[data-cerrar]') || e.target === capa) cerrar();
  });
}

/** Al desbloquear: muestra el "Te extraño" que llegó mientras tanto. */
export function alDesbloquear() {
  ajustarAlturaEntrada();
  if (!estado.yaSeVio) {
    estado.yaSeVio = true;
    bajarAlFondo(false);
  }
  if (estado.teExtranoPendiente) mostrarTeExtrano(estado.teExtranoPendiente);
  marcarLeidosSiCorresponde();
}

/** Al volver a la app (desde otra app o con el celular desbloqueado). */
export function alVolver() {
  if (!estado.abierto) return;
  if (claveDia(Date.now()) !== estado.diaRender) renderizarTodo({ mantenerPosicion: !estaAbajo() });
  ctx.backend.reconectar();
  sincronizar();
  revisarVaciado();
  procesarBandeja();
  reintentarPushes();
  refrescarPerfiles();
  actualizarCabecera();
  marcarLeidosSiCorresponde();
}

/** Al salir de la app: una grabación a medias se cancela (el celular corta el micrófono). */
export function alOcultar() {
  if (estado.grabadora) {
    cancelarGrabacion();
    aviso('La grabación se canceló al salir de la app.');
  }
}

/* ==========================================================================
   Menús y acciones sobre un mensaje
   ========================================================================== */
function abrirMenuMensaje(cid) {
  const m = estado.mensajes.get(cid);
  if (!m) return;
  ultimoMenu = Date.now();
  vibrar(12);
  const mio = esMio(m);
  const confirmado = !!m.id;
  const acciones = [];
  if (m._estado === 'error') {
    acciones.push(['reintentar', 'reintentar', 'Reintentar envío']);
    acciones.push(['descartar', 'basura', 'Descartar', 'peligro']);
  }
  if (confirmado && !m.borrado) acciones.push(['responder', 'responder', 'Responder']);
  if (!m.borrado && m.tipo === 'texto' && m.contenido) acciones.push(['copiar', 'copiar', 'Copiar']);
  if (!m.borrado && m.tipo === 'imagen') acciones.push(['ver', 'imagen', 'Ver foto']);
  if (mio && confirmado && !m.borrado && m.tipo === 'texto' && Date.now() - Date.parse(m.creado_en) < MINUTOS_EDICION * 60000)
    acciones.push(['editar', 'lapiz', 'Editar']);
  if (mio && confirmado) acciones.push(['info', 'info', 'Información']);
  if (mio && confirmado && !m.borrado) acciones.push(['borrar', 'basura', 'Eliminar para los dos', 'peligro']);

  const mia = m.reacciones?.[ctx.yo];
  const reacciones =
    confirmado && !m.borrado
      ? `<div class="reacciones-rapidas" role="group" aria-label="Reaccionar">${REACCIONES.map(
          (r) => `<button type="button" data-reaccion="${r}" aria-pressed="${mia === r}" aria-label="Reaccionar con ${r}">${r}</button>`,
        ).join('')}</div>`
      : '';
  const { capa, cerrar } = hoja(
    `<div class="vista-mensaje">${escaparHtml(recortar(resumenMensaje(m), 180))}</div>${reacciones}
     <ul class="lista-acciones">${acciones
       .map(([accion, ic, texto, clase]) => `<li><button type="button" class="${clase || ''}" data-accion="${accion}">${icono(ic)}${texto}</button></li>`)
       .join('')}</ul>`,
    'Opciones del mensaje',
  );
  capa.addEventListener('click', (e) => {
    const r = e.target.closest('[data-reaccion]');
    if (r) {
      cerrar();
      reaccionar(cid, mia === r.dataset.reaccion ? null : r.dataset.reaccion);
      return;
    }
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'copiar') copiarTexto(m.contenido); // dentro del toque (el portapapeles lo exige)
    cerrar();
    luego(() => ejecutarAccion(accion, cid));
  });
}

function ejecutarAccion(accion, cid) {
  const m = estado.mensajes.get(cid);
  if (!m) return;
  if (accion === 'responder') responderA(cid);
  else if (accion === 'editar') iniciarEdicion(m);
  else if (accion === 'borrar') borrarMensaje(cid);
  else if (accion === 'info') mostrarInfo(m);
  else if (accion === 'ver') verFoto(cid);
  else if (accion === 'reintentar') reintentarEnvio(cid);
  else if (accion === 'descartar') descartarEnvio(cid);
}

async function reaccionar(cid, emoji) {
  const m = estado.mensajes.get(cid);
  if (!m?.id) return;
  const antes = { ...(m.reacciones || {}) };
  const despues = { ...antes };
  if (emoji) despues[ctx.yo] = emoji;
  else delete despues[ctx.yo];
  m.reacciones = despues;
  pintarReacciones(nodos.get(cid), m);
  if (emoji) vibrar(10);
  try {
    await ctx.backend.reaccionar(m.id, emoji);
  } catch (error) {
    m.reacciones = antes;
    pintarReacciones(nodos.get(cid), m);
    aviso(esErrorDeRed(error) ? 'Sin conexión: la reacción no se guardó.' : 'No se pudo reaccionar.');
  }
}

function corazonDobleToque(fila) {
  if (movimientoReducido()) return;
  const burbuja = fila.querySelector('.burbuja');
  const pop = document.createElement('span');
  pop.className = 'pop-corazon';
  pop.textContent = '❤️';
  pop.setAttribute('aria-hidden', 'true');
  burbuja.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

async function borrarMensaje(cid) {
  const m = estado.mensajes.get(cid);
  if (!m?.id) return;
  const si = await confirmar({
    titulo: '¿Eliminar para los dos?',
    texto: 'El mensaje también desaparecerá del celular de tu pareja.',
    aceptar: 'Eliminar',
    peligro: true,
  });
  if (!si) return;
  const original = { ...m };
  const borrado = { ...m, borrado: true, contenido: null, media_path: null, media_meta: null, reacciones: {} };
  estado.mensajes.set(cid, borrado);
  actualizarFila(borrado, original);
  try {
    await ctx.backend.borrar(m.id);
  } catch (error) {
    estado.mensajes.set(cid, original);
    actualizarFila(original, borrado);
    aviso(!esErrorDeRed(error) && error?.message ? error.message : 'Sin conexión: no se pudo eliminar.');
  }
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    aviso('Mensaje copiado');
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      aviso('Mensaje copiado');
    } catch {
      aviso('No se pudo copiar.');
    }
    area.remove();
  }
}

function mostrarInfo(m) {
  dialogo(
    `<h2>Información del mensaje</h2>
     <ul class="lista-info">
       <li>${icono('check')}<div><strong>Enviado</strong>${escaparHtml(fechaCompleta(m.creado_en))}</div></li>
       <li>${icono('checkDoble')}<div><strong>Entregado</strong>${m.entregado_en ? escaparHtml(fechaCompleta(m.entregado_en)) : 'Todavía no'}</div></li>
       <li>${icono('ojo')}<div><strong>Leído</strong>${m.leido_en ? escaparHtml(fechaCompleta(m.leido_en)) : 'Todavía no'}</div></li>
     </ul>
     <div class="botones"><button type="button" class="boton" data-cerrar>Listo</button></div>`,
    'Información del mensaje',
  );
}

async function verFoto(cid) {
  const m = estado.mensajes.get(cid);
  if (!m || m.tipo !== 'imagen' || m.borrado) return;
  const url = m._urlLocal || (await ctx.backend.urlFirmada(m.media_path));
  if (!url) {
    aviso('No se pudo abrir la foto. Revisa tu conexión.');
    return;
  }
  const f = new Date(fechaDe(m));
  const dos = (n) => String(n).padStart(2, '0');
  const sello = `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}_${dos(f.getHours())}${dos(f.getMinutes())}`;
  const ext = (m.media_path || '').split('.').pop() || 'webp';
  abrirVisor({
    url,
    titulo: esMio(m) ? 'Tú' : nombreDe(m.remitente),
    subtitulo: `${etiquetaDia(fechaDe(m))}, ${hora(fechaDe(m))}`,
    nombreArchivo: `Foto_Messenger_Estrellita_y_Jampier_${sello}.${ext}`,
  });
}

/* ==========================================================================
   Búsqueda
   ========================================================================== */
function resaltar(texto, consulta) {
  const seguro = escaparHtml(recortar(texto, 220));
  const patron = escaparHtml(consulta).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return patron ? seguro.replace(new RegExp(patron, 'gi'), (x) => `<mark>${x}</mark>`) : seguro;
}

export function abrirBusqueda() {
  const panel = crearElemento(`
    <section class="panel" role="dialog" aria-modal="true" aria-label="Buscar en el chat">
      <header class="cabecera">
        <button type="button" class="boton-icono" data-cerrar aria-label="Volver">${icono('atras')}</button>
        <div class="campo-texto campo-busqueda">${icono('buscar')}<label for="texto-busqueda" class="solo-lector">Buscar</label><input id="texto-busqueda" type="search" placeholder="Buscar mensajes…" autocomplete="off" enterkeyhint="search"></div>
      </header>
      <div class="cuerpo"><div class="resultados" id="resultados-busqueda"></div></div>
    </section>`);
  const cerrar = abrirCapa(panel, () => {
    ctx.alCerrarPanel?.();
  });
  ctx.alAbrirPanel?.();
  const entrada = panel.querySelector('#texto-busqueda');
  const contenedor = panel.querySelector('#resultados-busqueda');
  const vacio = (texto) => {
    contenedor.innerHTML = `<div class="vacio">${icono('buscar')}${escaparHtml(texto)}</div>`;
  };
  vacio('Escribe una palabra para buscarla en toda la conversación.');
  setTimeout(() => entrada.focus(), 60);

  const buscarAhora = retrasar(async () => {
    const consulta = entrada.value.trim();
    if (consulta.length < 2) {
      vacio('Escribe al menos dos letras.');
      return;
    }
    vacio('Buscando…');
    try {
      const filas = (await ctx.backend.buscar(consulta)).filter((f) => !quedoOculto(f));
      if (!filas.length) {
        vacio(`No hay mensajes con “${consulta}”.`);
        return;
      }
      contenedor.innerHTML = filas
        .map(
          (f) => `
          <button type="button" class="resultado" data-id="${escaparHtml(f.id)}" data-cid="${escaparHtml(f.client_id)}">
            <span class="cabeza"><strong>${escaparHtml(f.remitente === ctx.yo ? 'Tú' : nombreDe(f.remitente))}</strong><span>${escaparHtml(etiquetaDia(f.creado_en))}, ${escaparHtml(hora(f.creado_en))}</span></span>
            <span class="cuerpo-res">${resaltar(f.contenido, consulta)}</span>
          </button>`,
        )
        .join('');
    } catch (error) {
      vacio(esErrorDeRed(error) ? 'Sin conexión: la búsqueda necesita internet.' : 'No se pudo buscar. Intenta otra vez.');
    }
  }, 300);
  entrada.addEventListener('input', buscarAhora);
  panel.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) return cerrar();
    const r = e.target.closest('[data-id]');
    if (r) {
      cerrar();
      luego(() => irAMensaje(r.dataset.id, r.dataset.cid));
    }
  });
}

async function irAMensaje(id, cidConocido) {
  let cid = cidConocido && estado.mensajes.has(cidConocido) ? cidConocido : estado.porId.get(id);
  if (!cid || !nodos.has(cid)) {
    const quitar = aviso('Buscando el mensaje…', { duracion: 0 });
    estado.listoParaAntiguos = true;
    let vueltas = 0;
    while ((!cid || !nodos.has(cid)) && estado.hayMasAntiguos && vueltas < 60) {
      await cargarAntiguos();
      cid = estado.porId.get(id) || (cidConocido && estado.mensajes.has(cidConocido) ? cidConocido : null);
      vueltas += 1;
    }
    quitar?.();
  }
  const fila = cid && nodos.get(cid);
  if (!fila) {
    aviso('No encontré ese mensaje.');
    return;
  }
  fila.scrollIntoView({ block: 'center', behavior: movimientoReducido() ? 'auto' : 'smooth' });
  fila.classList.remove('resaltada');
  void fila.offsetWidth;
  fila.classList.add('resaltada');
  setTimeout(() => fila.classList.remove('resaltada'), 1700);
}

/* ==========================================================================
   Menú de la cabecera
   ========================================================================== */
export function abrirMenuCabecera() {
  const opciones = [
    ['buscar', 'buscar', 'Buscar en el chat'],
    ['borrar', 'basura', 'Borrar mensajes'],
    ['ajustes', 'ajustes', 'Ajustes'],
  ];
  if (ctx.tienePin()) opciones.push(['bloquear', 'candado', 'Bloquear ahora']);
  if (ctx.puedeInstalar()) opciones.push(['instalar', 'celular', 'Instalar la app']);
  const { capa, cerrar } = hoja(
    `<ul class="lista-acciones">${opciones
      .map(([accion, ic, texto]) => `<li><button type="button" data-accion="${accion}">${icono(ic)}${texto}</button></li>`)
      .join('')}</ul>`,
    'Más opciones',
  );
  capa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    cerrar();
    const accion = b.dataset.accion;
    luego(() => {
      if (accion === 'buscar') abrirBusqueda();
      else if (accion === 'borrar') abrirBorrarMensajes();
      else if (accion === 'ajustes') ctx.abrirAjustes();
      else if (accion === 'bloquear') ctx.bloquearAhora();
      else if (accion === 'instalar') ctx.instalar();
    });
  });
}

/* ==========================================================================
   Borrar mensajes: uno solo o vaciar todo el chat para los dos
   ========================================================================== */
function abrirBorrarMensajes() {
  const gesto = plataforma().tactil ? 'Mantén presionado' : 'Haz clic derecho en';
  const pareja = nombreDe(ctx.pareja()?.id);
  const { capa, cerrar } = hoja(
    `<h2>Borrar mensajes</h2>
    <ol class="pasos">
      <li><span><strong>Uno solo:</strong> ${gesto} un mensaje tuyo y toca <strong>Eliminar para los dos</strong>.</span></li>
      <li><span><strong>Vaciar solo para mí:</strong> el chat queda vacío en tu celular. ${escaparHtml(pareja)} lo sigue viendo y todo queda guardado.</span></li>
      <li><span><strong>Vaciar para los dos:</strong> se borran todos los mensajes, fotos y notas de voz de los dos celulares. No se puede deshacer.</span></li>
    </ol>
    <div class="botones-borrar">
      <button type="button" class="boton secundario ancho" data-accion="vaciar-mio">${icono('basura')}Vaciar solo para mí</button>
      <button type="button" class="boton peligro ancho" data-accion="vaciar">${icono('basura')}Vaciar para los dos</button>
      <button type="button" class="boton fantasma ancho" data-cerrar>Cancelar</button>
    </div>`,
    'Borrar mensajes',
  );
  capa.querySelector('[data-accion="vaciar-mio"]').addEventListener('click', () => {
    cerrar();
    luego(vaciarSoloParaMi);
  });
  capa.querySelector('[data-accion="vaciar"]').addEventListener('click', () => {
    cerrar();
    luego(vaciarChat);
  });
}

/** Vacía el chat solo en mi pantalla: la pareja lo sigue viendo y nada se borra de la nube. */
async function vaciarSoloParaMi() {
  const pareja = nombreDe(ctx.pareja()?.id);
  const si = await confirmar({
    titulo: '¿Vaciar el chat solo para ti?',
    texto: `Los mensajes desaparecen de tu celular (y de tus otros dispositivos). ${pareja} los sigue viendo y quedan guardados.`,
    aceptar: 'Vaciar para mí',
    peligro: true,
  });
  if (!si) return;
  // El corte es el último mensaje que ya llegó (hora del servidor, no la del celular)
  let ultimo = '';
  for (const m of estado.mensajes.values()) if (m.creado_en && fechaMs(m.creado_en) > fechaMs(ultimo)) ultimo = m.creado_en;
  ocultarHasta(ultimo || new Date().toISOString());
  aviso('Listo: el chat quedó vacío solo para ti');
}

/**
 * "Vaciar solo para mí": no muestra nada enviado hasta `iso`. Se guarda en
 * mis ajustes de la nube, así también queda vacío en mis otros dispositivos.
 * @param {string} iso
 * @param {{ desdeNube?: boolean }} [opciones]
 */
export function ocultarHasta(iso, { desdeNube = false } = {}) {
  if (!ctx?.yo || !fechaMs(iso) || fechaMs(iso) <= fechaMs(local.leer(`oculto:${ctx.yo}`, ''))) return;
  local.guardar(`oculto:${ctx.yo}`, iso);
  if (!desdeNube) ctx.subirAjustes?.();
  quitarHastaCorte();
}

/** Quita de la pantalla y de lo guardado lo que quedó antes del corte. */
function quitarHastaCorte() {
  if (!estado.abierto) return 0;
  estado.corte = calcularCorte();
  let quitados = 0;
  for (const [cid, m] of estado.mensajes) {
    if (quedoOculto(m)) {
      if (m._urlLocal) URL.revokeObjectURL(m._urlLocal);
      estado.mensajes.delete(cid);
      quitados++;
    }
  }
  estado.porId.clear();
  for (const [cid, m] of estado.mensajes) if (m.id) estado.porId.set(m.id, cid);
  estado.hayMasAntiguos = false;
  estado.sinLeerAbajo = 0;
  if (estado.respondiendoA || estado.editando) cancelarContexto();
  detenerAudio();
  reconstruirOrden();
  renderizarTodo();
  bajarAlFondo(false);
  actualizarInicioChat();
  actualizarFranjas();
  guardarCacheRetrasado();
  return quitados;
}

/** Vacía el chat para los dos, con doble confirmación. */
async function vaciarChat() {
  const pareja = nombreDe(ctx.pareja()?.id);
  const si = await confirmar({
    titulo: '¿Vaciar todo el chat?',
    texto: `Se borrarán todos los mensajes, fotos y notas de voz, también del celular de ${pareja}.`,
    aceptar: 'Sí, vaciar',
    peligro: true,
  });
  if (!si) return;
  const seguro = await confirmar({
    titulo: '¿Segurísimo? 🥺',
    texto: 'Esto no se puede deshacer: los mensajes no se pueden recuperar.',
    aceptar: 'Vaciar para los dos',
    cancelar: 'No, mejor no',
    peligro: true,
  });
  if (!seguro) return;
  const quitar = aviso('Vaciando el chat…', { duracion: 0 });
  try {
    await ctx.backend.vaciarChat();
    // La hora la pone el servidor (así los dos celulares cortan en el mismo punto)
    const { vaciadoEn } = await ctx.backend.estadoChat().catch(() => ({}));
    quitar?.();
    aplicarVaciado(vaciadoEn || new Date().toISOString(), ctx.yo);
    aviso('Listo: el chat quedó vacío para los dos');
  } catch (error) {
    quitar?.();
    aviso(esErrorDeRed(error) ? 'Necesitas internet para vaciar el chat.' : error?.message || 'No se pudo vaciar el chat.');
  }
}

/** Pregunta al servidor si el chat se vació (por si este celular no estaba conectado). */
async function revisarVaciado() {
  if (!estado.abierto) return;
  try {
    const { vaciadoEn, vaciadoPor } = await ctx.backend.estadoChat();
    if (vaciadoEn) aplicarVaciado(vaciadoEn, vaciadoPor);
  } catch {
    /* sin señal: se revisa la próxima vez */
  }
}

/**
 * Quita de la pantalla y de lo guardado todo lo enviado hasta `vaciadoEn`.
 * Lo que está en la bandeja (escrito sin señal, aún sin enviar) se conserva.
 */
function aplicarVaciado(vaciadoEn, vaciadoPor) {
  const corte = Date.parse(vaciadoEn);
  if (!estado.abierto || !corte) return;
  const clave = `vaciado:${ctx.yo}`;
  const previo = Date.parse(local.leer(clave, '') || '') || 0;
  if (previo >= corte) return; // ya se aplicó
  local.guardar(clave, vaciadoEn);
  const quitados = quitarHastaCorte();
  // Las fotos guardadas para ver sin señal ya no se necesitan
  if ('caches' in window) caches.delete('eyj-media-v1').catch(() => {});
  if (quitados && vaciadoPor && vaciadoPor !== ctx.yo) aviso(`${nombreDe(vaciadoPor)} vació el chat`);
}

/* ==========================================================================
   Eventos
   ========================================================================== */
function enlazarEventos() {
  // Redactor
  el.entrada.addEventListener('input', () => {
    ajustarAlturaEntrada();
    actualizarBotonPrincipal();
    guardarBorrador();
    if (el.entrada.value.trim()) avisarEscribiendo();
  });
  el.entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !plataforma().tactil) {
      e.preventDefault();
      enviarDesdeRedactor();
    }
  });
  el.entrada.addEventListener('focus', () => {
    if (estaAbajo()) setTimeout(() => bajarAlFondo(false), 250);
  });
  // Evita que el teclado del celular se cierre al tocar "enviar"
  el.principal.addEventListener('pointerdown', (e) => {
    if (el.entrada.value.trim() || estado.editando) e.preventDefault();
  });
  el.principal.addEventListener('click', () => {
    if (estado.editando || el.entrada.value.trim()) enviarDesdeRedactor();
    else iniciarGrabacion();
  });
  el.botonEmojis.addEventListener('click', alternarEmojis);
  el.panelEmojis.addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (b) insertarEnEntrada(b.dataset.emoji);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.panelEmojis.hidden && !e.target.closest('#panel-emojis, #boton-emojis')) cerrarEmojis();
  });
  el.botonFoto.addEventListener('click', () => el.selectorFotos.click());
  // Cámara: solo en celulares y tablets (en el computador no abre la cámara)
  el.botonCamara.hidden = !plataforma().tactil;
  el.botonCamara.addEventListener('click', () => el.selectorCamara.click());
  el.selectorCamara.addEventListener('change', () => {
    const archivos = [...el.selectorCamara.files];
    el.selectorCamara.value = '';
    abrirPreviaFotos(archivos); // misma vista previa: se ve la foto, se agrega un mensaje y se envía
  });
  el.selectorFotos.addEventListener('change', () => {
    const archivos = [...el.selectorFotos.files];
    el.selectorFotos.value = '';
    abrirPreviaFotos(archivos);
  });
  el.barraContexto.addEventListener('click', (e) => {
    if (e.target.closest('[data-cancelar]')) cancelarContexto();
  });
  $('#cancelar-grabacion').addEventListener('click', cancelarGrabacion);
  $('#enviar-grabacion').addEventListener('click', enviarGrabacion);

  // Cabecera
  $('#boton-te-extrano').addEventListener('click', enviarTeExtrano);
  $('#boton-menu').addEventListener('click', abrirMenuCabecera);
  $('#boton-persona').addEventListener('click', () => ctx.abrirAjustes());
  pintarEnfriamiento();

  // Bajar al final
  el.irAbajo.addEventListener('click', () => bajarAlFondo(true));
  let pendienteScroll = false;
  el.desplazable.addEventListener(
    'scroll',
    () => {
      if (pendienteScroll) return;
      pendienteScroll = true;
      requestAnimationFrame(() => {
        pendienteScroll = false;
        ordenarFechasPegadas();
        const d = distanciaAlFondo();
        el.irAbajo.hidden = d < 320;
        if (d < 160 && estado.sinLeerAbajo) {
          estado.sinLeerAbajo = 0;
          actualizarBotonAbajo();
        }
        if (el.desplazable.scrollTop < 700) cargarAntiguos();
      });
    },
    { passive: true },
  );

  enlazarGestos();

  // Conexión
  window.addEventListener('online', () => {
    actualizarFranjas();
    estado.fallosSeguidos = 0;
    sincronizar();
    procesarBandeja();
    reintentarPushes();
  });
  window.addEventListener('offline', actualizarFranjas);
}

function enlazarGestos() {
  let gesto = null;
  const limpiarGesto = () => {
    if (!gesto) return;
    clearTimeout(gesto.temporizador);
    const burbuja = gesto.fila.querySelector('.burbuja');
    const icono_ = gesto.fila.querySelector('.icono-deslizar');
    if (burbuja) {
      burbuja.style.transition = '';
      burbuja.style.transform = '';
    }
    if (icono_) {
      icono_.style.opacity = '';
      icono_.style.transform = '';
    }
  };

  el.mensajes.addEventListener('pointerdown', (e) => {
    tipoPuntero = e.pointerType || 'mouse';
    const fila = e.target.closest('.fila');
    if (!fila || e.button > 0) return;
    if (e.target.closest('.reacciones, .boton-play, .velocidad, .onda, .abrir-menu, a')) return;
    gesto = { fila, cid: fila.dataset.cid, x: e.clientX, y: e.clientY, id: e.pointerId, tipo: e.pointerType, modo: null, dx: 0 };
    if (e.pointerType !== 'mouse') {
      gesto.temporizador = setTimeout(() => {
        if (gesto && !gesto.modo) {
          gesto.modo = 'menu';
          abrirMenuMensaje(gesto.cid);
        }
      }, 480);
    }
  });

  el.mensajes.addEventListener('pointermove', (e) => {
    if (!gesto || e.pointerId !== gesto.id) return;
    const dx = e.clientX - gesto.x;
    const dy = e.clientY - gesto.y;
    if (!gesto.modo) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        limpiarGesto();
        gesto = null;
        return;
      }
      if (gesto.tipo !== 'mouse' && dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        gesto.modo = 'deslizar';
        clearTimeout(gesto.temporizador);
      } else if (Math.abs(dx) > 10) clearTimeout(gesto.temporizador);
    }
    if (gesto.modo === 'deslizar') {
      gesto.dx = Math.max(0, Math.min(dx, 90));
      const burbuja = gesto.fila.querySelector('.burbuja');
      const icono_ = gesto.fila.querySelector('.icono-deslizar');
      burbuja.style.transition = 'none';
      burbuja.style.transform = `translateX(${gesto.dx}px)`;
      icono_.style.opacity = String(Math.min(1, gesto.dx / 60));
      icono_.style.transform = `scale(${0.6 + Math.min(0.4, gesto.dx / 150)})`;
      if (gesto.dx >= 60 && !gesto.vibro) {
        vibrar(8);
        gesto.vibro = true;
      }
    }
  });

  const terminar = (e) => {
    if (!gesto || (e.pointerId !== undefined && e.pointerId !== gesto.id)) return;
    const g = gesto;
    limpiarGesto();
    gesto = null;
    if (g.modo === 'deslizar' && g.dx >= 60) responderA(g.cid);
    if (g.modo) ultimoGesto = { hora: Date.now() };
  };
  el.mensajes.addEventListener('pointerup', terminar);
  el.mensajes.addEventListener('pointercancel', terminar);
  el.desplazable.addEventListener(
    'scroll',
    () => {
      if (gesto && !gesto.modo) {
        limpiarGesto();
        gesto = null;
      }
    },
    { passive: true },
  );

  // Clic derecho (computador) o toque largo (Android)
  el.mensajes.addEventListener('contextmenu', (e) => {
    const fila = e.target.closest('.fila');
    if (!fila || e.target.closest('a')) return;
    e.preventDefault();
    if (Date.now() - ultimoMenu < 800) return;
    abrirMenuMensaje(fila.dataset.cid);
  });

  // Toques
  el.mensajes.addEventListener('click', (e) => {
    if (ultimoGesto && Date.now() - ultimoGesto.hora < 450) {
      ultimoGesto = null;
      return;
    }
    const fila = e.target.closest('.fila');
    if (!fila) return;
    const cid = fila.dataset.cid;
    const m = estado.mensajes.get(cid);
    if (!m) return;
    if (e.target.closest('.abrir-menu, .reacciones')) return abrirMenuMensaje(cid);
    const cita = e.target.closest('.cita');
    if (cita) return irAMensaje(cita.dataset.ir);
    if (e.target.closest('.boton-play')) return alternarAudio(cid);
    if (e.target.closest('.velocidad')) return cambiarVelocidad();
    const onda = e.target.closest('.onda');
    if (onda) {
      const r = onda.getBoundingClientRect();
      return alternarAudio(cid, Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    }
    if (e.target.closest('a')) return;
    if (m._estado === 'error') return abrirMenuMensaje(cid);

    // Doble toque = ❤️ (en celular) · un toque en una foto = abrirla
    const ahora = Date.now();
    const esFoto = !!e.target.closest('.marco-foto');
    if (estado.toque && estado.toque.cid === cid && ahora - estado.toque.t < 320) {
      clearTimeout(estado.toque.temporizador);
      estado.toque = null;
      if (m.id && !m.borrado && (tipoPuntero !== 'mouse' || esFoto)) {
        const actual = m.reacciones?.[ctx.yo];
        reaccionar(cid, actual === '❤️' ? null : '❤️');
        if (actual !== '❤️') corazonDobleToque(fila);
      }
      return;
    }
    estado.toque = {
      cid,
      t: ahora,
      temporizador: esFoto
        ? setTimeout(() => {
            estado.toque = null;
            verFoto(cid);
          }, 320)
        : null,
    };
  });
}
