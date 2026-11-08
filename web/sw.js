/* ==========================================================================
   sw.js — Service worker de Messenger Estrellita y Jampier ❤️
   --------------------------------------------------------------------------
   · Guarda la app en el celular para que abra rápido y funcione sin señal.
   · Guarda las fotos ya vistas (por su ruta) para verlas sin internet.
   · Recibe las notificaciones push y las muestra.
   ✏️ Cada vez que cambies archivos de la app, sube el número de VERSION:
      así todos los celulares reciben la versión nueva.
   ========================================================================== */
const VERSION = 'eyj-v1.1.1';
const CACHE_APP = `${VERSION}-app`;
const CACHE_MEDIA = 'eyj-media-v1';
const MAX_FOTOS = 400;

// La página principal se guarda como './' (no 'index.html'): Cloudflare Pages
// redirige /index.html → / y una respuesta redirigida no sirve para abrir la
// app sin señal.
const ARCHIVOS_APP = [
  './',
  'manifest.webmanifest',
  'css/styles.css',
  'js/tema-inicial.js',
  'js/app.js',
  'js/chat.js',
  'js/config.js',
  'js/almacen.js',
  'js/candado.js',
  'js/media.js',
  'js/notificaciones.js',
  'js/interfaz.js',
  'js/utilidades.js',
  'js/iconos.js',
  'js/backend-supabase.js',
  'js/backend-demo.js',
  'js/vendor/supabase.js',
  'fonts/nunito-variable.woff2',
  'fonts/nunito-variable-italica.woff2',
  'fonts/dancing-script-variable.woff2',
  'img/favicon.svg',
  'img/icon-192.png',
  'img/badge-96.png',
];

/* ---------- Instalar y activar ---------- */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_APP).then((cache) => cache.addAll(ARCHIVOS_APP.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((n) => n.startsWith('eyj-') && n !== CACHE_APP && n !== CACHE_MEDIA).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// La app pide activar la versión nueva cuando tocas "Actualizar"
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'ACTUALIZAR') self.skipWaiting();
});

/* ---------- Peticiones ---------- */
function conLimite(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('tiempo agotado')), ms))]);
}

/** Copia "limpia" de una respuesta que llegó tras una redirección (el navegador
    rechaza las redirigidas cuando se usan para abrir una página). */
async function sinRedireccion(respuesta) {
  if (!respuesta.redirected) return respuesta;
  return new Response(await respuesta.blob(), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: respuesta.headers,
  });
}

/** Primero internet (para tener siempre lo último); sin señal, lo guardado. */
async function primeroRed(peticion, claveCache) {
  const cache = await caches.open(CACHE_APP);
  const red = fetch(peticion).then((respuesta) => {
    if (respuesta.ok) cache.put(claveCache || peticion, respuesta.clone());
    return respuesta;
  });
  try {
    return await conLimite(red, 3500);
  } catch {
    const guardada = await cache.match(claveCache || peticion, { ignoreSearch: true });
    if (guardada) return sinRedireccion(guardada);
    return red.catch(() => Response.error());
  }
}

/** Primero lo guardado (fuentes, íconos, librerías que casi nunca cambian). */
async function primeroCache(peticion) {
  const cache = await caches.open(CACHE_APP);
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok) cache.put(peticion, respuesta.clone());
  return respuesta;
}

async function recortarCache(cache) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_FOTOS; i++) await cache.delete(claves[i]);
}

/** Fotos privadas: se guardan por su ruta (sin el token temporal de la URL). */
async function fotoGuardada(peticion, url) {
  const cache = await caches.open(CACHE_MEDIA);
  const clave = `${url.origin}${url.pathname}`;
  const guardada = await cache.match(clave);
  if (guardada) return guardada;
  try {
    const respuesta = await fetch(url.href, { mode: 'cors', credentials: 'omit' });
    if (respuesta.ok) {
      await cache.put(clave, respuesta.clone());
      recortarCache(cache);
    }
    return respuesta;
  } catch {
    return fetch(peticion);
  }
}

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;
  const url = new URL(peticion.url);

  if (url.pathname.includes('/storage/v1/object/sign/media/') && peticion.destination === 'image') {
    evento.respondWith(fotoGuardada(peticion, url));
    return;
  }
  if (url.origin !== self.location.origin) return; // Supabase y demás: directo a internet

  if (peticion.mode === 'navigate') {
    evento.respondWith(primeroRed(peticion, './'));
    return;
  }
  if (/\/(fonts|img|js\/vendor)\//.test(url.pathname)) {
    evento.respondWith(primeroCache(peticion));
    return;
  }
  evento.respondWith(primeroRed(peticion));
});

/* ---------- Notificaciones push ---------- */
self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data?.text() };
  }
  const titulo = datos.titulo || 'Messenger E ❤ J';
  const opciones = {
    body: datos.cuerpo || 'Tienes un mensaje nuevo 💌',
    icon: new URL('img/icon-192.png', self.registration.scope).href,
    badge: new URL('img/badge-96.png', self.registration.scope).href,
    tag: datos.tag || 'chat',
    renotify: true,
    vibrate: datos.vibrar || [80, 40, 80],
    timestamp: Date.now(),
    data: { url: new URL(datos.url || './', self.registration.scope).href },
  };
  evento.waitUntil(
    (async () => {
      if (typeof datos.no_leidos === 'number' && 'setAppBadge' in self.navigator) {
        try {
          await self.navigator.setAppBadge(datos.no_leidos);
        } catch {
          /* sin insignia */
        }
      }
      await self.registration.showNotification(titulo, opciones);
    })(),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || self.registration.scope;
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const ventana of ventanas) {
        if (ventana.url.startsWith(self.registration.scope)) {
          ventana.postMessage({ tipo: 'abrir-chat' });
          return ventana.focus();
        }
      }
      return self.clients.openWindow(destino);
    })(),
  );
});

// Si el navegador renueva la suscripción, se crea otra con la misma clave.
// La app la guarda en Supabase la próxima vez que se abra.
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(
    (async () => {
      try {
        const opciones = evento.oldSubscription?.options;
        if (opciones) await self.registration.pushManager.subscribe(opciones);
      } catch {
        /* se renueva al abrir la app */
      }
    })(),
  );
});
