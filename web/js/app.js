/* ==========================================================================
   app.js — Arranque y flujo general de Messenger Estrellita y Jampier ❤️
   --------------------------------------------------------------------------
   Pantallas: carga → entrada (login) → PIN → chat.
   Además: temas claro/oscuro, ajustes, notificaciones push, instalación
   como app, bloqueo automático al salir y "latido" (en línea / últ. vez).
   ========================================================================== */
import { CLAVE_PELIGROSA, CONFIG, FALTA_CONEXION, MODO_DEMO } from './config.js';
import { icono, pintarIconos } from './iconos.js';
import { kv, local } from './almacen.js';
import { borrarPin, guardarPin, tienePin, verificarPin } from './candado.js';
import { comprimirImagen } from './media.js';
import { datosSuscripcion, desuscribir, estadoPermiso, soportaPush, suscribir } from './notificaciones.js';
import { abrirCapa, aviso, cerrarTodasLasCapas, confirmar, crearElemento, dialogo, hoja, prepararSonido } from './interfaz.js';
import { $, escaparHtml, esErrorDeRed, plataforma, retrasar, vibrar } from './utilidades.js';
import * as chat from './chat.js';
import { BackendDemo } from './backend-demo.js';
import { BackendSupabase } from './backend-supabase.js';

const VISTA_PREVIA = window.__VISTA_PREVIA__ === true;
const temaDelAnfitrion = document.documentElement.getAttribute('data-theme');

/* ---------- Estado general ---------- */
const app = {
  pantalla: 'carga',
  bloqueado: false,
  ocultoDesde: null,
  panelesAbiertos: 0,
  registroSW: null,
  promptInstalacion: null,
  intervaloLatido: null,
  chatAbierto: false,
  urlFondo: null,
};

let backend = null;

/** Contexto compartido con chat.js */
const ctx = {
  backend: null,
  yo: null,
  correo: '',
  perfiles: new Map(),
  modoDemo: MODO_DEMO,
  esVistaPrevia: VISTA_PREVIA,
  pareja: () => [...ctx.perfiles.values()].find((p) => p.id !== ctx.yo) || null,
  miPerfil: () => ctx.perfiles.get(ctx.yo) || null,
  puedeVer: () => document.visibilityState === 'visible' && !app.bloqueado && app.pantalla === 'chat',
  puedeLeer: () => ctx.puedeVer() && app.panelesAbiertos === 0,
  ajustes: () => ({ sonido: local.leer('sonido', true) }),
  guardarPreferencia: (clave, valor) => guardarPreferencia(clave, valor),
  subirAjustes: () => marcarParaSubir(),
  tienePin: () => !!ctx.yo && tienePin(ctx.yo),
  puedeInstalar: () => !VISTA_PREVIA && !plataforma().standalone,
  abrirAjustes: () => abrirAjustes(),
  bloquearAhora: () => bloquear(),
  instalar: () => instalar(),
  borrarInsignia: () => navigator.clearAppBadge?.().catch(() => {}),
  alAbrirPanel: () => {
    app.panelesAbiertos += 1;
  },
  alCerrarPanel: () => {
    app.panelesAbiertos = Math.max(0, app.panelesAbiertos - 1);
    chat.marcarLeidosSiCorresponde();
  },
};

/* ==========================================================================
   Pantallas
   ========================================================================== */
function mostrarPantalla(nombre) {
  app.pantalla = nombre;
  $('#pantalla-carga').hidden = nombre !== 'carga';
  $('#pantalla-conexion').hidden = nombre !== 'conexion';
  $('#pantalla-entrada').hidden = nombre !== 'entrada';
  $('#pantalla-pin').hidden = nombre !== 'pin';
  $('#pantalla-chat').hidden = !(nombre === 'chat' || (nombre === 'pin' && app.chatAbierto));
  $('#pantalla-chat').inert = nombre !== 'chat';
}

/* ==========================================================================
   Tema claro / oscuro
   ========================================================================== */
function temaOscuroActivo() {
  const a = document.documentElement.getAttribute('data-theme');
  if (a === 'dark') return true;
  if (a === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function actualizarColorBarra() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim() || '#FBF3EE';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = color;
  document.head.appendChild(meta);
}

function pintarBotonTema() {
  const boton = $('#boton-tema');
  if (!boton) return;
  const oscuro = temaOscuroActivo();
  boton.innerHTML = icono(oscuro ? 'sol' : 'luna');
  boton.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

function aplicarTema(preferencia) {
  const raiz = document.documentElement;
  if (preferencia === 'claro') raiz.setAttribute('data-theme', 'light');
  else if (preferencia === 'oscuro') raiz.setAttribute('data-theme', 'dark');
  else if (VISTA_PREVIA && temaDelAnfitrion) raiz.setAttribute('data-theme', temaDelAnfitrion);
  else raiz.removeAttribute('data-theme');
  local.guardar('tema', preferencia);
  actualizarColorBarra();
  pintarBotonTema();
}

function alternarTema() {
  const nuevo = temaOscuroActivo() ? 'claro' : 'oscuro';
  aplicarTema(nuevo);
  guardarPreferencia('tema', nuevo);
}

window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (local.leer('tema', 'auto') === 'auto') {
    actualizarColorBarra();
    pintarBotonTema();
  }
});

/* ---------- Fondo del chat ---------- */
async function aplicarFondo(tipo) {
  const zona = $('#zona-chat');
  const pedido = tipo;
  if (tipo === 'foto') {
    const datos = await kv.leer('fondo-foto');
    if (datos?.buffer) {
      if (app.urlFondo) URL.revokeObjectURL(app.urlFondo);
      app.urlFondo = URL.createObjectURL(new Blob([datos.buffer], { type: datos.tipo }));
      zona.style.setProperty('--fondo-foto', `url("${app.urlFondo}")`);
    } else tipo = 'corazones'; // la foto vive solo en el celular donde se eligió
  }
  zona.dataset.fondo = tipo;
  local.guardar('fondo', pedido); // se recuerda lo que se eligió, aunque aquí no esté la foto
}

/* ==========================================================================
   Ajustes que nunca se reinician
   --------------------------------------------------------------------------
   Cada ajuste se guarda en este celular Y en la base de datos
   (perfiles.preferencias). Al entrar —aunque se haya cerrado sesión, borrado
   los datos o cambiado de celular— vuelve todo tal como se dejó. Si no hay
   señal, el cambio se sube solo cuando vuelve la conexión.
   ========================================================================== */
const CLAVES_PREFERENCIAS = ['tema', 'fondo', 'sonido', 'bloqueo-seg', 'velocidad-audio', 'avisos'];
const clavePendientes = () => `preferencias-pendientes:${ctx.yo}`;

function preferenciasLocales() {
  const p = {};
  for (const clave of CLAVES_PREFERENCIAS) {
    const valor = local.leer(clave, null);
    if (valor !== null) p[clave] = valor;
  }
  // "Vaciar solo para mí" (se guarda por persona: en un mismo celular pueden entrar los dos)
  const oculto = ctx.yo && local.leer(`oculto:${ctx.yo}`, null);
  if (oculto) p['oculto-hasta'] = oculto;
  return p;
}

/** Guarda un ajuste para siempre: en este celular y en la nube. */
function guardarPreferencia(clave, valor) {
  local.guardar(clave, valor);
  marcarParaSubir();
}

/** Sube los ajustes a la nube (o en cuanto vuelva la señal). */
function marcarParaSubir() {
  if (!ctx.yo) return;
  local.guardar(clavePendientes(), true);
  subirPreferencias();
}

const subirPreferencias = retrasar(async () => {
  if (!ctx.yo || !backend || !local.leer(clavePendientes(), false)) return;
  const preferencias = preferenciasLocales();
  try {
    await backend.actualizarMiPerfil({ preferencias });
    const yo = ctx.miPerfil();
    if (yo) yo.preferencias = preferencias;
    local.borrar(clavePendientes());
  } catch {
    /* sin señal: se reintenta al volver la conexión o al entrar */
  }
}, 700);

/** Al entrar: recupera los ajustes guardados en la nube (o sube los de este celular si quedaron cambios sin subir). */
async function sincronizarPreferencias() {
  const servidor = ctx.miPerfil()?.preferencias || {};
  if (local.leer(clavePendientes(), false) || !Object.keys(servidor).length) {
    // Cambios hechos sin señal, o la primera vez con esta versión: mandan los de este celular
    if (Object.keys(preferenciasLocales()).length) {
      local.guardar(clavePendientes(), true);
      subirPreferencias();
    }
  } else {
    if (servidor.tema && servidor.tema !== local.leer('tema', 'auto')) aplicarTema(servidor.tema);
    if (servidor.fondo && servidor.fondo !== local.leer('fondo', 'corazones')) await aplicarFondo(servidor.fondo);
    for (const clave of ['sonido', 'bloqueo-seg', 'velocidad-audio', 'avisos']) {
      if (clave in servidor) local.guardar(clave, servidor[clave]);
    }
    // Chat vaciado "solo para mí" en otro dispositivo: aquí también
    if (servidor['oculto-hasta']) chat.ocultarHasta(servidor['oculto-hasta'], { desdeNube: true });
  }
  await revisarAvisos();
}

/* ==========================================================================
   Altura real de la pantalla (para que el teclado del iPhone no tape la barra)
   ========================================================================== */
function configurarAlturaVisible() {
  const vv = window.visualViewport;
  if (VISTA_PREVIA || !vv) return;
  const ajustar = () => {
    if (Math.abs((vv.scale || 1) - 1) > 0.01) return;
    document.documentElement.style.setProperty('--alto-app', `${Math.round(vv.height)}px`);
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', ajustar);
  vv.addEventListener('scroll', ajustar);
  ajustar();
}

/* ==========================================================================
   Service worker (funciona sin señal + notificaciones + actualizaciones)
   ========================================================================== */
async function registrarServiceWorker() {
  if (VISTA_PREVIA || !('serviceWorker' in navigator)) return;
  const seguro = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!seguro) return;
  try {
    const teniaControlador = !!navigator.serviceWorker.controller;
    const registro = await navigator.serviceWorker.register('sw.js');
    app.registroSW = registro;
    const vigilar = (sw) => {
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) ofrecerActualizacion(sw);
      });
    };
    if (registro.waiting && navigator.serviceWorker.controller) ofrecerActualizacion(registro.waiting);
    registro.addEventListener('updatefound', () => vigilar(registro.installing));
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!teniaControlador || recargando) return;
      recargando = true;
      location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.tipo === 'abrir-chat' && ctx.yo && !app.bloqueado) mostrarPantalla('chat');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update().catch(() => {});
    });
    // La suscripción push se renueva al entrar (revisarAvisos), cuando ya se sabe quién eres.
  } catch (error) {
    console.warn('No se pudo registrar el service worker:', error);
  }
}

function ofrecerActualizacion(sw) {
  if (app.ofreciendoActualizacion) return; // ya se está mostrando: no repetirlo
  app.ofreciendoActualizacion = true;
  aviso('Hay una versión nueva de la app ✨', {
    accion: 'Actualizar',
    alAccionar: () => sw.postMessage({ tipo: 'ACTUALIZAR' }),
    duracion: 0,
  });
}

/* ==========================================================================
   Notificaciones push
   ========================================================================== */
const vapidListo = () => !!CONFIG.VAPID_PUBLIC_KEY;

function notificacionesActivas() {
  return (
    !MODO_DEMO &&
    soportaPush() &&
    estadoPermiso() === 'granted' &&
    local.leer('avisos', null) !== false &&
    !!local.leer('push-endpoint')
  );
}

/** El service worker listo (sin quedarse esperando para siempre si no arrancó). */
function serviceWorkerListo() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('El service worker no arrancó')), 10000)),
  ]);
}

/**
 * Renueva en silencio la suscripción de este celular y la deja a nombre de
 * quien entró (si el celular era de la otra cuenta, pasa a esta).
 * @returns {Promise<boolean>} true si quedó activa
 */
async function asegurarSuscripcion() {
  if (MODO_DEMO || !ctx.yo || !vapidListo() || !soportaPush() || estadoPermiso() !== 'granted') return false;
  try {
    const registro = await serviceWorkerListo();
    const suscripcion = await suscribir(registro, CONFIG.VAPID_PUBLIC_KEY);
    await backend.guardarSuscripcion(datosSuscripcion(suscripcion));
    local.guardar('push-endpoint', suscripcion.endpoint);
    return true;
  } catch (error) {
    console.warn('No se pudo renovar la suscripción push:', error);
    return false;
  }
}

/**
 * Al entrar: los avisos quedan exactamente como cada uno los dejó.
 * Activados → se renuevan en este celular. Apagados (aquí o en el otro
 * celular) → se apagan aquí también. Nunca se apagan solos.
 */
async function revisarAvisos() {
  if (MODO_DEMO) return;
  const avisos = local.leer('avisos', null);
  if (avisos === false) {
    if (local.leer('push-endpoint')) await desuscribirEsteCelular();
    return;
  }
  if (avisos === null && !local.leer('push-endpoint')) return; // nunca los activó
  if (estadoPermiso() !== 'granted') return; // la tarjeta "Activa las notificaciones" lo pide
  const activos = await asegurarSuscripcion();
  if (activos && avisos === null) guardarPreferencia('avisos', true); // versión anterior: se guarda la elección
}

/** Se llama desde un toque: pide permiso y suscribe este dispositivo. */
async function activarNotificaciones() {
  if (MODO_DEMO) {
    aviso('En la vista previa no hay notificaciones. En la app conectada se activan aquí.');
    return false;
  }
  if (!vapidListo()) {
    aviso('Falta la clave VAPID en js/config.js. Mira el paso de notificaciones en la guía.', { duracion: 5000 });
    return false;
  }
  const p = plataforma();
  if (p.ios && !p.standalone) {
    abrirGuiaInstalacion();
    return false;
  }
  if (!soportaPush() || !app.registroSW) {
    aviso('Este navegador no permite notificaciones.');
    return false;
  }
  let permiso;
  try {
    permiso = await Notification.requestPermission();
  } catch {
    permiso = Notification.permission;
  }
  if (permiso !== 'granted') {
    aviso(
      permiso === 'denied'
        ? 'Las notificaciones están bloqueadas. Actívalas en los ajustes del celular para esta app.'
        : 'No se activaron las notificaciones.',
      { duracion: 5000 },
    );
    return false;
  }
  try {
    const registro = await serviceWorkerListo();
    const suscripcion = await suscribir(registro, CONFIG.VAPID_PUBLIC_KEY);
    await backend.guardarSuscripcion(datosSuscripcion(suscripcion));
    local.guardar('push-endpoint', suscripcion.endpoint);
    guardarPreferencia('avisos', true); // queda así para siempre, hasta que lo apagues
    aviso('¡Listo! Te avisaré cuando te escriba 💌');
    return true;
  } catch (error) {
    console.error('Error al activar notificaciones:', error);
    aviso('No se pudieron activar. Revisa tu conexión e inténtalo de nuevo.');
    return false;
  }
}

/** Apaga los avisos SOLO cuando la persona lo pide en Ajustes (queda guardado). */
async function desactivarNotificaciones() {
  await desuscribirEsteCelular();
  guardarPreferencia('avisos', false);
}

/** Deja de recibir avisos en este celular. */
async function desuscribirEsteCelular() {
  try {
    if ('serviceWorker' in navigator) {
      const registro = await serviceWorkerListo();
      const endpoint = await desuscribir(registro);
      await backend.borrarSuscripcion(endpoint || local.leer('push-endpoint'));
    }
  } catch {
    /* nada */
  }
  local.borrar('push-endpoint');
}

function textoEstadoNotificaciones() {
  const p = plataforma();
  if (MODO_DEMO) return 'Se activan en la app ya conectada.';
  if (!vapidListo()) return 'Falta configurar la clave VAPID.';
  if (p.ios && !p.standalone) return 'En iPhone, primero instala la app.';
  if (!soportaPush()) return 'Este navegador no las permite.';
  if (estadoPermiso() === 'denied') return 'Bloqueadas en los ajustes del celular.';
  return notificacionesActivas() ? 'Activadas.' : 'Apagadas.';
}

function posponerTarjeta() {
  local.guardar('tarjeta-notif-hasta', Date.now() + 7 * 86400000);
}

function mostrarTarjetaNotificaciones() {
  if (local.leer('tarjeta-notif-hasta', 0) > Date.now()) return chat.mostrarTarjeta(null);
  const p = plataforma();
  if (!MODO_DEMO && p.ios && !p.standalone) {
    return chat.mostrarTarjeta({
      icono: 'celular',
      titulo: 'Instala la app en tu iPhone',
      texto: 'Así te llegan las notificaciones.',
      boton: 'Cómo',
      alAceptar: abrirGuiaInstalacion,
      alCerrar: posponerTarjeta,
    });
  }
  // Si los apagó a propósito en Ajustes, no se le vuelve a insistir.
  const losApago = local.leer('avisos', null) === false;
  if (
    MODO_DEMO ||
    (!losApago && soportaPush() && estadoPermiso() === 'default') ||
    (!losApago && estadoPermiso() === 'granted' && !local.leer('push-endpoint'))
  ) {
    return chat.mostrarTarjeta({
      icono: 'campana',
      titulo: 'Activa las notificaciones',
      texto: 'Para saber al instante cuando te escriba.',
      boton: 'Activar',
      alAceptar: async () => {
        if (await activarNotificaciones()) chat.mostrarTarjeta(null);
      },
      alCerrar: posponerTarjeta,
    });
  }
  chat.mostrarTarjeta(null);
}

/* ==========================================================================
   Instalación como app
   ========================================================================== */
function escucharInstalacion() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    app.promptInstalacion = e;
  });
  window.addEventListener('appinstalled', () => {
    app.promptInstalacion = null;
    aviso('¡App instalada! Ábrela desde tu pantalla de inicio 💜');
  });
}

async function instalar() {
  if (app.promptInstalacion) {
    const solicitud = app.promptInstalacion;
    app.promptInstalacion = null;
    solicitud.prompt();
    await solicitud.userChoice.catch(() => null);
    return;
  }
  abrirGuiaInstalacion();
}

function abrirGuiaInstalacion() {
  const p = plataforma();
  const pasosIphone = `
    <ol class="pasos">
      <li><span>Abre esta página en <strong>Safari</strong>.</span></li>
      <li><span>Toca <strong>Compartir</strong> ${icono('compartir')} (en iOS 26 está dentro del botón •••).</span></li>
      <li><span>Elige <strong>Agregar a pantalla de inicio</strong> ${icono('agregar')} y deja activado “Abrir como app web”.</span></li>
      <li><span>Abre la app desde su ícono y activa las notificaciones.</span></li>
    </ol>`;
  const pasosAndroid = `
    <ol class="pasos">
      <li><span>Abre esta página en <strong>Chrome</strong>.</span></li>
      <li><span>Toca el menú ⋮ y elige <strong>Instalar app</strong> o “Agregar a la pantalla principal”.</span></li>
      <li><span>Abre la app desde su ícono y activa las notificaciones.</span></li>
    </ol>`;
  const pasosPc = `
    <ol class="pasos">
      <li><span>En Chrome o Edge, busca el ícono de instalar ${icono('descargar')} en la barra de direcciones.</span></li>
      <li><span>Haz clic en <strong>Instalar</strong>: queda como una app más del computador.</span></li>
    </ol>`;
  hoja(
    `<h2>Instalar Messenger E ❤ J</h2>${p.ios ? pasosIphone : p.android ? pasosAndroid : pasosPc}<button type="button" class="boton ancho" data-cerrar>Entendido</button>`,
    'Instalar la app',
  );
}

/* ==========================================================================
   Latido: "en línea" y "últ. vez"
   ========================================================================== */
function iniciarLatido() {
  detenerLatido();
  if (!ctx.yo) return;
  backend.latido(true);
  app.intervaloLatido = setInterval(() => {
    if (document.visibilityState === 'visible' && !app.bloqueado) backend.latido(true);
  }, 15000);
}

function detenerLatido() {
  clearInterval(app.intervaloLatido);
  app.intervaloLatido = null;
}

/* ==========================================================================
   Entrada: usuario + PIN de 4 números (el mismo PIN para los dos)
   --------------------------------------------------------------------------
   El servidor revisa el PIN y lleva la cuenta de los fallos (5 → esperar
   15 min; 15 → bloqueada). Al entrar, el PIN queda guardado CIFRADO en este
   dispositivo para el bloqueo automático (así se abre aunque no haya señal).
   ========================================================================== */
function errorEntrada(texto) {
  $('#error-entrada').textContent = texto;
}

/**
 * La app está publicada, pero web/js/config.js aún no tiene los datos de
 * Supabase: se explica qué falta en vez de mostrar una conversación de mentira.
 * Si pegaron la clave secreta por error, se avisa y no se usa.
 */
function mostrarFaltaConexion() {
  $('#conexion-pendiente').hidden = CLAVE_PELIGROSA;
  $('#conexion-peligro').hidden = !CLAVE_PELIGROSA;
  $('#enlace-demo').hidden = CLAVE_PELIGROSA;
  mostrarPantalla('conexion');
}

/**
 * Pantalla de entrada en 2 pasos:
 *   1. "¿Quién eres?" → un botón por persona (CONFIG.PERSONAS).
 *   2. "Hola, Jampier" → solo el PIN (con el 4.º número entra sola).
 * @param {string} mensaje  Aviso para mostrar (por ejemplo, "El PIN se cambió").
 * @param {{persona?: string}} opciones  Usuario a dejar elegido (salta al paso 2).
 */
function mostrarEntrada(mensaje = '', { persona = '' } = {}) {
  errorEntrada(mensaje);
  $('#caja-demo').hidden = !MODO_DEMO;
  if (MODO_DEMO && backend?.pinDemo) $('#pin-demo').textContent = backend.pinDemo();
  $('#pin-entrada').value = '';
  mostrarPantalla('entrada');
  if (persona && personaPorUsuario(persona)) elegirPersona(persona, { conservarMensaje: true });
  else volverAElegir({ conservarMensaje: true });
}

const personaPorUsuario = (usuario) => CONFIG.PERSONAS.find((p) => p.usuario === usuario) || null;

/** Paso 2: la persona ya está elegida, solo falta el PIN. */
function elegirPersona(usuario, { conservarMensaje = false } = {}) {
  const persona = personaPorUsuario(usuario);
  if (!persona) return;
  if (!conservarMensaje) errorEntrada('');
  $('#usuario').value = persona.usuario;
  $('#nombre-entrada').textContent = `Hola, ${persona.nombre}`;
  $('#avatar-entrada').textContent = persona.nombre.trim().charAt(0).toUpperCase() || '♥';
  $('#paso-persona').hidden = true;
  $('#formulario-entrada').hidden = false;
  $('#pin-entrada').value = '';
  // Foco inmediato (dentro del mismo toque): así el iPhone abre el teclado de números
  $('#pin-entrada').focus();
}

/** Paso 1: volver a "¿Quién eres?". */
function volverAElegir({ conservarMensaje = false } = {}) {
  if (!conservarMensaje) errorEntrada('');
  $('#usuario').value = '';
  $('#pin-entrada').value = '';
  $('#formulario-entrada').hidden = true;
  $('#paso-persona').hidden = false;
}

/** Dibuja los botones "Soy …" a partir de CONFIG.PERSONAS. */
function pintarPersonas() {
  $('#botones-persona').innerHTML = CONFIG.PERSONAS.map(
    (p) => `
      <button type="button" class="boton-persona" data-persona="${escaparHtml(p.usuario)}">
        <span class="avatar" aria-hidden="true">${escaparHtml(p.nombre.trim().charAt(0).toUpperCase() || '♥')}</span>
        <span class="texto-persona">Soy ${escaparHtml(p.nombre)}</span>
      </button>`,
  ).join('');
}

const claveVersionPin = (id) => `pin-version:${id}`;

/** Entra con la persona elegida + el PIN. */
async function ingresar(usuario, pinEscrito) {
  const boton = $('#boton-entrar');
  if (boton.disabled) return;
  if (!personaPorUsuario(usuario)) return volverAElegir();
  if (!/^[0-9]{4}$/.test(pinEscrito)) return errorEntrada('El PIN son 4 números.');
  boton.disabled = true;
  boton.textContent = 'Entrando…';
  errorEntrada('');
  try {
    const { usuario: cuenta, version } = await backend.entrar(usuario, pinEscrito);
    // El mismo PIN abre el bloqueo automático de este dispositivo
    await guardarPin(cuenta.id, pinEscrito);
    local.guardar(claveVersionPin(cuenta.id), version);
    local.guardar('ultimo-usuario', usuario);
    $('#pin-entrada').value = '';
    await entrarConUsuario(cuenta, { recienEntrado: true });
  } catch (error) {
    $('#pin-entrada').value = '';
    errorEntrada(error?.message || 'No se pudo entrar.');
    vibrar([40, 30, 40]);
    $('#pin-entrada').focus();
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
}

function enlazarEntrada() {
  pintarPersonas();
  const campoPin = $('#pin-entrada');
  $('#botones-persona').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-persona]');
    if (boton) elegirPersona(boton.dataset.persona);
  });
  $('#cambiar-persona').addEventListener('click', () => volverAElegir());

  $('#formulario-entrada').addEventListener('submit', (e) => {
    e.preventDefault();
    ingresar($('#usuario').value, campoPin.value.trim());
  });
  // Solo números; con el 4.º número entra solo (como el desbloqueo del celular)
  campoPin.addEventListener('input', () => {
    const limpio = campoPin.value.replace(/\D/g, '').slice(0, 4);
    if (campoPin.value !== limpio) campoPin.value = limpio;
    if (limpio.length === 4 && $('#usuario').value) $('#formulario-entrada').requestSubmit();
  });

  $('#ver-clave').addEventListener('click', () => {
    const ver = campoPin.type === 'password';
    campoPin.type = ver ? 'text' : 'password';
    const boton = $('#ver-clave');
    boton.innerHTML = icono(ver ? 'ojoOff' : 'ojo');
    boton.setAttribute('aria-label', ver ? 'Ocultar PIN' : 'Mostrar PIN');
  });
}

async function entrarConUsuario(usuario, { recienEntrado = false } = {}) {
  // Sesión de una versión anterior (sin PIN guardado aquí): que entre con usuario + PIN
  if (!tienePin(usuario.id)) {
    await backend.salir();
    mostrarEntrada();
    return;
  }

  ctx.yo = usuario.id;
  ctx.correo = usuario.email || '';

  const guardados = await kv.leer(`perfiles:${ctx.yo}`);
  if (guardados?.length) for (const p of guardados) ctx.perfiles.set(p.id, p);
  let sinRed = false;
  try {
    const lista = await backend.cargarPerfiles();
    ctx.perfiles.clear();
    for (const p of lista) ctx.perfiles.set(p.id, p);
    kv.guardar(`perfiles:${ctx.yo}`, lista);
  } catch (error) {
    sinRed = esErrorDeRed(error);
    if (!sinRed) console.warn('No se pudieron cargar los perfiles:', error);
  }

  if (!ctx.perfiles.has(ctx.yo) && !sinRed) {
    await backend.salir();
    ctx.yo = null;
    mostrarEntrada(
      'Tu cuenta entró, pero no tiene perfil en la base de datos. Ejecuta el archivo supabase/01_estructura.sql (paso 2 de la guía) y vuelve a entrar.',
    );
    return;
  }

  app.chatAbierto = true;
  chat.abrirChat();
  aplicarFondo(local.leer('fondo', 'corazones'));
  // Ajustes y avisos tal como se dejaron (desde la nube si hace falta)
  sincronizarPreferencias().catch((error) => console.warn('No se pudieron recuperar los ajustes:', error));

  if (recienEntrado) {
    desbloquear();
    // Que quede claro quién entró y con quién habla (arriba sale la otra persona)
    const yo = ctx.miPerfil();
    const pareja = ctx.pareja();
    if (yo) aviso(`Hola, ${yo.nombre} 💜 Estás hablando con ${pareja?.nombre || 'tu amor'}`, { duracion: 4000 });
  }
  else mostrarPin();
}

/**
 * Sale sin preguntar (cerrar sesión, PIN olvidado, demasiados intentos o PIN
 * cambiado). NO se pierde nada: los mensajes guardados, el borrador, los
 * ajustes y los avisos se quedan (los avisos siguen llegando a este celular).
 * Solo se olvida el PIN guardado aquí, para que haya que entrar de nuevo.
 */
async function forzarSalida(mensaje = '') {
  const yo = ctx.yo;
  cerrarTodasLasCapas();
  chat.cerrarChat();
  app.chatAbierto = false;
  detenerLatido();
  ctx.yo = null; // primero: así nada intenta guardar a nombre de la sesión que se cierra
  await backend.salir();
  if (yo) {
    borrarPin(yo);
    local.borrar(claveVersionPin(yo));
  }
  ctx.perfiles.clear();
  app.bloqueado = false;
  // Con aviso (por ejemplo, "El PIN se cambió") queda elegida la misma persona
  mostrarEntrada(mensaje, { persona: mensaje ? local.leer('ultimo-usuario', '') : '' });
}

async function cerrarSesion() {
  const si = await confirmar({
    titulo: '¿Cerrar sesión?',
    texto: 'No se borra nada: tus mensajes, tus ajustes y los avisos se quedan como están. Vuelves a entrar tocando tu nombre y poniendo el PIN.',
    aceptar: 'Cerrar sesión',
  });
  if (!si) return;
  await forzarSalida();
}

/**
 * Si el PIN se cambió en el otro celular, este deja de abrir con el viejo:
 * se pide entrar otra vez con el PIN nuevo.
 */
async function revisarVersionPin() {
  if (!ctx.yo) return;
  const version = await backend.versionPin();
  const guardada = local.leer(claveVersionPin(ctx.yo), null);
  if (version === null || guardada === null || version === guardada) return;
  await forzarSalida('El PIN se cambió. Entra con el PIN nuevo 🔑');
}

/* ==========================================================================
   Bloqueo automático: el mismo PIN, revisado en este dispositivo
   ========================================================================== */
const pin = { valor: '', ocupado: false };

function pintarPuntos() {
  [...$('#puntos-pin').children].forEach((punto, i) => punto.classList.toggle('lleno', i < pin.valor.length));
  $('#estado-pin-lector').textContent = `${pin.valor.length} de 4 números`;
}

function mostrarPin() {
  app.bloqueado = true;
  pin.valor = '';
  // La pantalla del PIN queda limpia: sin corazones cayendo ni avisos del chat encima
  document.querySelectorAll('.lluvia').forEach((n) => n.remove());
  $('#avisos-flotantes').replaceChildren();
  app.ofreciendoActualizacion = false; // ese aviso se vuelve a ofrecer al desbloquear
  const yo = ctx.miPerfil();
  chat.pintarAvatar($('#avatar-pin'), yo);
  $('#titulo-pin').textContent = `Hola, ${yo?.nombre || 'amor'}`;
  $('#texto-pin').textContent = 'Escribe el PIN para abrir el chat.';
  $('#error-pin').textContent = '';
  pintarPuntos();
  mostrarPantalla('pin');
  detenerLatido();
  backend.presencia(false);
}

function errorPin(texto) {
  pin.valor = '';
  const puntos = $('#puntos-pin');
  puntos.classList.remove('error');
  void puntos.offsetWidth;
  puntos.classList.add('error');
  vibrar([40, 30, 40]);
  pintarPuntos();
  $('#error-pin').textContent = texto;
  setTimeout(() => puntos.classList.remove('error'), 500);
}

function teclaPin(digito) {
  if (pin.ocupado || pin.valor.length >= 4) return;
  pin.valor += digito;
  $('#error-pin').textContent = '';
  pintarPuntos();
  vibrar(6);
  if (pin.valor.length === 4) setTimeout(completarPin, 130);
}

function borrarDigito() {
  if (pin.ocupado) return;
  pin.valor = pin.valor.slice(0, -1);
  pintarPuntos();
}

async function completarPin() {
  pin.ocupado = true;
  try {
    const r = await verificarPin(ctx.yo, pin.valor);
    if (r.ok) desbloquear();
    else if (r.bloquear) {
      errorPin('Demasiados intentos. Por seguridad, entra otra vez con tu usuario y el PIN.');
      setTimeout(forzarSalida, 1600);
    } else if (r.esperar) {
      errorPin(`Demasiados intentos. Espera ${r.esperar} segundos.`);
    } else {
      errorPin(r.restantes <= 5 ? `PIN incorrecto. Te quedan ${r.restantes} intentos.` : 'PIN incorrecto.');
    }
  } finally {
    pin.ocupado = false;
  }
}

function desbloquear() {
  app.bloqueado = false;
  mostrarPantalla('chat');
  iniciarLatido();
  backend.presencia(true);
  chat.alDesbloquear();
  mostrarTarjetaNotificaciones();
  revisarAccionInicial();
  revisarVersionPin();
  // Si había una versión nueva esperando (el aviso se limpió al bloquear), se ofrece otra vez
  if (app.registroSW?.waiting && navigator.serviceWorker?.controller) ofrecerActualizacion(app.registroSW.waiting);
}

/** Atajo del ícono de la app (Android): mantener presionado → "Enviar un Te extraño". */
function revisarAccionInicial() {
  if (app.accionRevisada) return;
  app.accionRevisada = true;
  const parametros = new URLSearchParams(location.search);
  if (parametros.get('accion') !== 'te-extrano') return;
  try {
    history.replaceState(history.state, '', location.pathname);
  } catch {
    /* nada */
  }
  setTimeout(() => chat.enviarTeExtrano(), 500);
}

function bloquear() {
  if (!ctx.yo || !tienePin(ctx.yo)) return;
  cerrarTodasLasCapas();
  mostrarPin();
}

function retardoBloqueoMs() {
  return Number(local.leer('bloqueo-seg', 60)) * 1000;
}

function enlazarPin() {
  const teclado = $('#teclado');
  teclado.innerHTML =
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="tecla" data-digito="${n}">${n}</button>`).join('') +
    `<span class="tecla vacia" aria-hidden="true"></span><button type="button" class="tecla" data-digito="0">0</button>` +
    `<button type="button" class="tecla especial" data-borrar aria-label="Borrar">${icono('borrarTecla')}</button>`;
  teclado.addEventListener('click', (e) => {
    const d = e.target.closest('[data-digito]');
    if (d) return teclaPin(d.dataset.digito);
    if (e.target.closest('[data-borrar]')) borrarDigito();
  });
  document.addEventListener('keydown', (e) => {
    if (app.pantalla !== 'pin') return;
    if (/^[0-9]$/.test(e.key)) teclaPin(e.key);
    else if (e.key === 'Backspace') borrarDigito();
  });

  $('#olvide-pin').addEventListener('click', async () => {
    const si = await confirmar({
      titulo: '¿Olvidaste el PIN?',
      texto:
        'Es el mismo para los dos: pregúntaselo a tu amor 💜. Si ninguno lo recuerda, Jampier pone uno nuevo desde Supabase con el archivo supabase/03_pin.sql.',
      aceptar: 'Salir de la cuenta',
      cancelar: 'Volver',
    });
    if (si) forzarSalida();
  });
}

/** Cambiar el PIN (es el mismo para los dos: cambia también para tu pareja). */
function abrirCambioDePin() {
  const campo = (id, texto) =>
    `<label class="etiqueta" for="${id}">${texto}</label>
     <div class="campo-texto">${icono('candado')}<input id="${id}" class="campo-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required></div>`;
  const { capa, cerrar } = dialogo(
    `<h2>Cambiar el PIN</h2>
     <p>Es el mismo para los dos: <strong>también cambia para ${escaparHtml(ctx.pareja()?.nombre || 'tu amor')}</strong>. Cuéntale el nuevo 💜</p>
     <form class="formulario-clave" novalidate>
       ${campo('pin-actual', 'PIN actual')}
       ${campo('pin-nuevo', 'PIN nuevo (4 números)')}
       ${campo('pin-repetido', 'Repite el PIN nuevo')}
       <p class="error-texto" role="alert"></p>
       <div class="botones">
         <button type="button" class="boton fantasma" data-cerrar>Cancelar</button>
         <button type="submit" class="boton">Guardar</button>
       </div>
     </form>`,
    'Cambiar el PIN',
  );
  const formulario = capa.querySelector('form');
  const error = formulario.querySelector('.error-texto');
  const boton = formulario.querySelector('[type="submit"]');
  formulario.querySelectorAll('.campo-pin').forEach((c) =>
    c.addEventListener('input', () => {
      c.value = c.value.replace(/\D/g, '').slice(0, 4);
    }),
  );
  setTimeout(() => formulario.querySelector('#pin-actual').focus(), 80);
  formulario.addEventListener('submit', async (e) => {
    e.preventDefault();
    const actual = formulario.querySelector('#pin-actual').value;
    const nuevo = formulario.querySelector('#pin-nuevo').value;
    const repetido = formulario.querySelector('#pin-repetido').value;
    if (!/^[0-9]{4}$/.test(actual) || !/^[0-9]{4}$/.test(nuevo)) return void (error.textContent = 'Cada PIN son 4 números.');
    if (nuevo !== repetido) return void (error.textContent = 'Los dos PIN nuevos no coinciden.');
    error.textContent = '';
    boton.disabled = true;
    try {
      const version = await backend.cambiarPin(actual, nuevo);
      await guardarPin(ctx.yo, nuevo);
      local.guardar(claveVersionPin(ctx.yo), version);
      cerrar();
      aviso('PIN cambiado 🔒 Cuéntaselo a tu amor');
    } catch (err) {
      error.textContent = err?.message || 'No se pudo cambiar. Inténtalo de nuevo.';
      boton.disabled = false;
    }
  });
}

/* ==========================================================================
   Ajustes
   ========================================================================== */
const segmento = (valor, ic, texto, actual) =>
  `<button type="button" data-valor="${valor}" aria-pressed="${String(valor) === String(actual)}">${icono(ic)}${texto}</button>`;

function abrirAjustes() {
  const yo = ctx.miPerfil();
  const pareja = ctx.pareja();
  const tema = local.leer('tema', 'auto');
  const fondo = local.leer('fondo', 'corazones');
  const bloqueo = String(local.leer('bloqueo-seg', 60));
  const sonido = local.leer('sonido', true);
  const mostrarInstalar = !VISTA_PREVIA && !plataforma().standalone;

  const panel = crearElemento(`
    <section class="panel" role="dialog" aria-modal="true" aria-labelledby="titulo-ajustes">
      <header class="cabecera">
        <button type="button" class="boton-icono" data-cerrar aria-label="Volver">${icono('atras')}</button>
        <h2 id="titulo-ajustes">Ajustes</h2>
      </header>
      <div class="cuerpo">
        <section class="seccion-ajustes">
          <h3>Tu perfil</h3>
          <div class="grupo-ajustes">
            <div class="perfil-ajustes">
              <button type="button" class="cambiar-foto" data-accion="foto" aria-label="Cambiar tu foto de perfil">
                <span class="avatar" id="avatar-ajustes"></span><span class="lapiz-foto">${icono('lapiz')}</span>
              </button>
              <div class="campo-texto">
                <label for="nombre-ajustes" class="solo-lector">Tu nombre</label>
                <input id="nombre-ajustes" maxlength="40" autocomplete="nickname" value="${escaparHtml(yo?.nombre || '')}">
              </div>
            </div>
          </div>
        </section>

        <section class="seccion-ajustes">
          <h3>Notificaciones</h3>
          <div class="grupo-ajustes">
            <label class="opcion">${icono('campana')}<span class="textos"><strong>Avisos en este dispositivo</strong><span id="estado-notif">${escaparHtml(textoEstadoNotificaciones())}</span></span>
              <input type="checkbox" class="interruptor" id="interruptor-notif" ${notificacionesActivas() ? 'checked' : ''}></label>
            <label class="opcion">${icono('ojo')}<span class="textos"><strong>Mostrar el mensaje en el aviso</strong><span>Apagado, el aviso solo dice “Tienes un mensaje nuevo 💌”.</span></span>
              <input type="checkbox" class="interruptor" id="interruptor-vista" ${yo?.notif_con_texto ? 'checked' : ''}></label>
            <label class="opcion">${icono('mensajeCorazon')}<span class="textos"><strong>Sonido dentro del chat</strong><span>Un tono suave cuando llega un mensaje.</span></span>
              <input type="checkbox" class="interruptor" id="interruptor-sonido" ${sonido ? 'checked' : ''}></label>
          </div>
        </section>

        <section class="seccion-ajustes">
          <h3>Apariencia</h3>
          <div class="grupo-ajustes">
            <div class="opcion bloque"><span class="textos"><strong>Tema</strong><span>Claro: piel y lila · Oscuro: negro y rojo suave</span></span>
              <div class="segmentos" role="group" aria-label="Tema" data-grupo="tema">
                ${segmento('auto', 'solLuna', 'Automático', tema)}${segmento('claro', 'sol', 'Claro', tema)}${segmento('oscuro', 'luna', 'Oscuro', tema)}
              </div></div>
            <div class="opcion bloque"><span class="textos"><strong>Fondo del chat</strong><span>La foto de fondo se guarda solo en este dispositivo.</span></span>
              <div class="segmentos" role="group" aria-label="Fondo del chat" data-grupo="fondo">
                ${segmento('corazones', 'corazon', 'Corazones', fondo)}${segmento('liso', 'paleta', 'Liso', fondo)}${segmento('foto', 'imagen', 'Foto', fondo)}
              </div></div>
          </div>
        </section>

        ${
          VISTA_PREVIA
            ? ''
            : `<section class="seccion-ajustes"><h3>Mensajes</h3><div class="grupo-ajustes">
                <button type="button" class="opcion" data-accion="papelera">${icono('historial')}<span class="textos"><strong>Papelera</strong><span>Lo que eliminen del chat queda guardado aquí, y los dos pueden verlo.</span></span>${icono('derecha', 'flecha')}</button>
              </div></section>`
        }

        <section class="seccion-ajustes">
          <h3>Seguridad</h3>
          <div class="grupo-ajustes">
            <button type="button" class="opcion" data-accion="cambiar-pin">${icono('candado')}<span class="textos"><strong>Cambiar PIN</strong><span>Es el mismo para los dos: cambia también para tu amor.</span></span>${icono('derecha', 'flecha')}</button>
            <div class="opcion bloque"><span class="textos"><strong>Bloquear automáticamente</strong><span>Tiempo fuera de la app antes de pedir el PIN.</span></span>
              <div class="segmentos" role="group" aria-label="Bloqueo automático" data-grupo="bloqueo">
                ${segmento('0', 'candado', 'Al salir', bloqueo)}${segmento('60', 'reloj', '1 min', bloqueo)}${segmento('300', 'reloj', '5 min', bloqueo)}
              </div></div>
            <button type="button" class="opcion" data-accion="bloquear">${icono('escudo')}<span class="textos"><strong>Bloquear ahora</strong><span>Pide el PIN de inmediato.</span></span>${icono('derecha', 'flecha')}</button>
          </div>
        </section>

        ${
          mostrarInstalar
            ? `<section class="seccion-ajustes"><h3>App</h3><div class="grupo-ajustes">
                <button type="button" class="opcion" data-accion="instalar">${icono('celular')}<span class="textos"><strong>Instalar en este dispositivo</strong><span>Queda con su ícono, como cualquier app.</span></span>${icono('derecha', 'flecha')}</button>
              </div></section>`
            : ''
        }

        <section class="seccion-ajustes">
          <h3>Cuenta</h3>
          <div class="grupo-ajustes">
            <div class="opcion">${icono('usuario')}<span class="textos"><strong>@${escaparHtml(yo?.usuario || 'sin usuario')}</strong><span>${pareja ? `Chat privado con ${escaparHtml(pareja.nombre)}` : 'Chat privado'}</span></span></div>
            <button type="button" class="opcion peligro" data-accion="salir">${icono('salir')}<span class="textos"><strong>Cerrar sesión</strong><span>No se borra nada; vuelves a entrar con tu nombre y el PIN.</span></span></button>
          </div>
        </section>

        <p class="pie-ajustes">Versión ${escaparHtml(CONFIG.VERSION)}${MODO_DEMO ? ' · modo demo' : ''}<span class="firma">Estrellita y Jampier ❤️</span></p>
      </div>
    </section>`);

  const cerrar = abrirCapa(panel, () => ctx.alCerrarPanel());
  ctx.alAbrirPanel();
  chat.pintarAvatar(panel.querySelector('#avatar-ajustes'), yo);

  // Nombre
  const campoNombre = panel.querySelector('#nombre-ajustes');
  const guardarNombre = async () => {
    const nombre = campoNombre.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    const perfil = ctx.miPerfil();
    if (!nombre || !perfil || nombre === perfil.nombre) {
      if (!nombre && perfil) campoNombre.value = perfil.nombre;
      return;
    }
    try {
      await backend.actualizarMiPerfil({ nombre });
      perfil.nombre = nombre;
      chat.pintarAvatar(panel.querySelector('#avatar-ajustes'), perfil);
      aviso('Nombre guardado');
    } catch {
      aviso('No se pudo guardar el nombre. Revisa tu conexión.');
      campoNombre.value = perfil.nombre;
    }
  };
  campoNombre.addEventListener('change', guardarNombre);
  campoNombre.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') campoNombre.blur();
  });

  // Interruptores
  panel.querySelector('#interruptor-notif').addEventListener('change', async (e) => {
    const casilla = e.currentTarget;
    if (casilla.checked) {
      const ok = await activarNotificaciones();
      casilla.checked = ok;
    } else {
      await desactivarNotificaciones();
      aviso('Avisos apagados en este dispositivo');
    }
    panel.querySelector('#estado-notif').textContent = textoEstadoNotificaciones();
  });
  panel.querySelector('#interruptor-vista').addEventListener('change', async (e) => {
    const casilla = e.currentTarget;
    const perfil = ctx.miPerfil();
    try {
      await backend.actualizarMiPerfil({ notif_con_texto: casilla.checked });
      if (perfil) perfil.notif_con_texto = casilla.checked;
    } catch {
      casilla.checked = !casilla.checked;
      aviso('No se pudo guardar. Revisa tu conexión.');
    }
  });
  panel.querySelector('#interruptor-sonido').addEventListener('change', (e) => guardarPreferencia('sonido', e.currentTarget.checked));

  // Segmentos y acciones
  panel.addEventListener('click', async (e) => {
    if (e.target.closest('[data-cerrar]')) return cerrar();
    const opcion = e.target.closest('.segmentos [data-valor]');
    if (opcion) {
      const grupo = opcion.closest('.segmentos');
      const valor = opcion.dataset.valor;
      const marcar = () => grupo.querySelectorAll('[data-valor]').forEach((b) => b.setAttribute('aria-pressed', String(b === opcion)));
      if (grupo.dataset.grupo === 'tema') {
        aplicarTema(valor);
        guardarPreferencia('tema', valor);
        marcar();
      } else if (grupo.dataset.grupo === 'bloqueo') {
        guardarPreferencia('bloqueo-seg', Number(valor));
        marcar();
      } else if (grupo.dataset.grupo === 'fondo') {
        if (valor === 'foto') $('#selector-fondo').click();
        else {
          await aplicarFondo(valor);
          guardarPreferencia('fondo', valor);
          marcar();
        }
      }
      return;
    }
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'foto') $('#selector-avatar').click();
    else if (accion === 'papelera') chat.irAPapelera();
    else if (accion === 'cambiar-pin') abrirCambioDePin();
    else if (accion === 'bloquear') {
      cerrar();
      setTimeout(bloquear, 60);
    } else if (accion === 'instalar') instalar();
    else if (accion === 'salir') cerrarSesion();
  });
}

function enlazarSelectoresDeAjustes() {
  $('#selector-avatar').addEventListener('change', async (e) => {
    const archivo = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!archivo) return;
    const perfil = ctx.miPerfil();
    if (!perfil) return;
    const quitar = aviso('Subiendo tu foto…', { duracion: 0 });
    try {
      const r = await comprimirImagen(archivo, { maxLado: 512, cuadrado: true, calidad: 0.85 });
      const ruta = `${ctx.yo}/avatar-${Date.now()}.${r.ext}`;
      await backend.subirMedia(r.blob, ruta, r.tipo);
      const anterior = perfil.avatar_path;
      await backend.actualizarMiPerfil({ avatar_path: ruta });
      perfil.avatar_path = ruta;
      if (anterior && anterior !== ruta) backend.borrarMedia(anterior);
      document.querySelectorAll('#avatar-ajustes, #avatar-pin').forEach((n) => chat.pintarAvatar(n, perfil));
      quitar?.();
      aviso('Foto de perfil actualizada');
    } catch (error) {
      quitar?.();
      aviso(esErrorDeRed(error) ? 'Sin conexión: no se pudo subir la foto.' : error?.message || 'No se pudo cambiar la foto.');
    }
  });

  $('#selector-fondo').addEventListener('change', async (e) => {
    const archivo = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!archivo) return;
    try {
      const r = await comprimirImagen(archivo, { maxLado: 1600, calidad: 0.8 });
      await kv.guardar('fondo-foto', { buffer: await r.blob.arrayBuffer(), tipo: r.tipo });
      await aplicarFondo('foto');
      guardarPreferencia('fondo', 'foto');
      document.querySelectorAll('[data-grupo="fondo"] [data-valor]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === 'foto')));
      aviso('Fondo actualizado');
    } catch (error) {
      aviso(error?.message || 'No se pudo usar esa foto.');
    }
  });
}

/* ==========================================================================
   Salir y volver a la app
   ========================================================================== */
function alOcultar() {
  app.ocultoDesde = Date.now();
  if (ctx.yo && tienePin(ctx.yo) && !app.bloqueado) $('#app').classList.add('privado');
  detenerLatido();
  backend?.presencia?.(false);
  if (ctx.yo) backend?.latidoAlSalir?.();
  chat.alOcultar();
}

function alMostrar() {
  $('#app').classList.remove('privado');
  if (!ctx.yo) return;
  const ausencia = Date.now() - (app.ocultoDesde || Date.now());
  if (tienePin(ctx.yo) && !app.bloqueado && app.pantalla === 'chat' && ausencia >= retardoBloqueoMs()) bloquear();
  if (!app.bloqueado) {
    iniciarLatido();
    backend.presencia(true);
    revisarVersionPin();
  }
  chat.alVolver();
}

/* ==========================================================================
   Arranque
   ========================================================================== */
async function arrancar() {
  if (VISTA_PREVIA) document.documentElement.classList.add('vista-previa');
  pintarIconos();
  aplicarTema(local.leer('tema', 'auto'));
  configurarAlturaVisible();
  // Versión visible debajo de "Nuestro rincón privado"
  document.querySelectorAll('[data-version]').forEach((n) => (n.textContent = `v${CONFIG.VERSION}`));

  // Publicada pero sin Supabase todavía: nada de mensajes de ejemplo
  if (FALTA_CONEXION) {
    mostrarFaltaConexion();
    return;
  }

  document.addEventListener('pointerdown', prepararSonido, { capture: true, passive: true });
  document.addEventListener('keydown', prepararSonido, { capture: true, passive: true });

  backend = MODO_DEMO ? new BackendDemo(window.__ACTIVOS_DEMO__ || {}) : new BackendSupabase();
  backend.alSalir = () => {
    if (ctx.yo) forzarSalida();
  };
  ctx.backend = backend;
  chat.iniciarChat(ctx);
  enlazarEntrada();
  enlazarPin();
  enlazarSelectoresDeAjustes();
  escucharInstalacion();
  $('#boton-tema').addEventListener('click', alternarTema);
  pintarBotonTema();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') alOcultar();
    else alMostrar();
  });
  window.addEventListener('pagehide', () => {
    if (ctx.yo) backend?.latidoAlSalir?.();
  });
  // Ajustes cambiados sin señal: se suben solos cuando vuelve la conexión
  window.addEventListener('online', () => subirPreferencias());

  let usuario = null;
  try {
    usuario = await backend.iniciar();
  } catch (error) {
    console.error('No se pudo iniciar la conexión:', error);
    mostrarEntrada(
      /supabaseUrl|Invalid|URL/i.test(String(error?.message))
        ? 'La configuración de Supabase no es válida. Revisa SUPABASE_URL y SUPABASE_KEY en js/config.js.'
        : 'No se pudo conectar. Revisa tu internet y recarga la página.',
    );
    return;
  }

  registrarServiceWorker();
  if (!usuario) return mostrarEntrada();
  await entrarConUsuario(usuario);
}

arrancar();
