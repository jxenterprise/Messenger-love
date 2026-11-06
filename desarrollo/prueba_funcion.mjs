// Prueba la Edge Function "enviar-push" en Node, imitando Deno, Supabase y los
// servicios de avisos (Google/Apple/Mozilla). Descifra cada aviso con http_ece
// (la librería de referencia que usa web-push) y verifica la firma VAPID.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ece = require('http_ece');
const webpush = require('web-push');

const [, , archivoFuncion] = process.argv;
const salida = new URL('./funcion-empaquetada.mjs', import.meta.url).pathname;

await build({
  entryPoints: [archivoFuncion],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: salida,
  logLevel: 'error',
  plugins: [
    {
      name: 'npm-especificador-deno',
      setup(b) {
        b.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: require.resolve('@supabase/supabase-js') }));
      },
    },
  ],
});

/* ---------------- Datos de prueba ---------------- */
const URL_SB = 'https://proyecto.supabase.co';
const SECRETA = 'sb_secret_prueba123';
const A = '11111111-1111-4111-8111-111111111111'; // Jampier
const B = '22222222-2222-4222-8222-222222222222'; // Estrellita
const vapid = webpush.generateVAPIDKeys(); // { publicKey, privateKey } en base64url
const env = {
  SUPABASE_URL: URL_SB,
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA }),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'jx@ejemplo.com', // sin mailto: a propósito
};

// Celulares de Estrellita: claves como las genera un navegador real
function celular(endpoint) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ecdh,
    auth,
    fila: { endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  };
}
const celulares = {
  android: celular('https://fcm.googleapis.com/fcm/send/abc123'),
  iphone: celular('https://web.push.apple.com/QGuQyavXut'),
  viejo: celular('https://updates.push.services.mozilla.com/wpush/v2/gone'),
};

let estado;
function reiniciar() {
  estado = {
    mensajes: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', remitente: A, tipo: 'texto', contenido: 'Hola mi amor, ¿cómo amaneciste? ☀️', media_meta: null, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date().toISOString() },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', remitente: A, tipo: 'te_extrano', contenido: null, media_meta: null, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date().toISOString() },
      { id: 'aaaaaaaa-0000-4000-8000-000000000003', remitente: A, tipo: 'audio', contenido: null, media_meta: { duracion: 74 }, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date().toISOString() },
      { id: 'aaaaaaaa-0000-4000-8000-000000000004', remitente: B, tipo: 'texto', contenido: 'mensaje de ella', media_meta: null, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date().toISOString() },
      { id: 'aaaaaaaa-0000-4000-8000-000000000005', remitente: A, tipo: 'texto', contenido: 'viejo', media_meta: null, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date(Date.now() - 13 * 3600e3).toISOString() },
    ],
    perfiles: [
      { id: A, nombre: 'Jampier', notif_con_texto: false, en_app: true, visto_en: new Date().toISOString() },
      { id: B, nombre: 'Estrellita', notif_con_texto: false, en_app: false, visto_en: new Date(Date.now() - 3600e3).toISOString() },
    ],
    suscripciones: [
      { id: 1, usuario: B, ...celulares.android.fila },
      { id: 2, usuario: B, ...celulares.iphone.fila },
      { id: 3, usuario: B, ...celulares.viejo.fila },
      { id: 4, usuario: A, ...celular('https://fcm.googleapis.com/fcm/send/de-jampier').fila },
    ],
    noLeidos: 3,
    entregas: [],
    respuestaServicio: { 'fcm.googleapis.com': 201, 'web.push.apple.com': 201, 'updates.push.services.mozilla.com': 410 },
    cabecerasSupabase: [],
  };
}

/* ---------------- Supabase y servicios de avisos simulados ---------------- */
const jsonRes = (cuerpo, status = 200, extra = {}) =>
  new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json', ...extra } });

function filtrar(filas, params) {
  return filas.filter((f) => {
    for (const [k, v] of params) {
      if (['select', 'columns', 'order', 'limit'].includes(k)) continue;
      if (v.startsWith('eq.') && String(f[k]) !== v.slice(3)) return false;
      if (v === 'is.null' && f[k] !== null) return false;
      if (v.startsWith('in.(')) {
        const lista = v.slice(4, -1).split(',');
        if (!lista.includes(String(f[k]))) return false;
      }
    }
    return true;
  });
}

globalThis.fetch = async (entrada, init = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const metodo = (init.method || 'GET').toUpperCase();
  const h = new Headers(init.headers || {});
  if (url.origin === URL_SB) {
    estado.cabecerasSupabase.push({ ruta: url.pathname, apikey: h.get('apikey'), authorization: h.get('authorization') });
    if (h.get('apikey') !== SECRETA) return jsonRes({ message: 'Invalid API key' }, 401);
    if (url.pathname === '/auth/v1/user') {
      const token = (h.get('authorization') || '').replace('Bearer ', '');
      if (token === 'jwt-jampier') return jsonRes({ id: A, aud: 'authenticated', role: 'authenticated', email: 'jampier@correo.com' });
      return jsonRes({ code: 403, error_code: 'bad_jwt', msg: 'invalid JWT' }, 403);
    }
    const tabla = url.pathname.replace('/rest/v1/', '');
    const params = [...url.searchParams.entries()];
    if (tabla === 'mensajes' && metodo === 'PATCH') {
      const cambios = JSON.parse(init.body);
      const filas = filtrar(estado.mensajes, params);
      filas.forEach((f) => Object.assign(f, cambios));
      const quiereObjeto = (h.get('accept') || '').includes('vnd.pgrst.object');
      if (quiereObjeto) {
        if (filas.length === 1) return jsonRes(filas[0]);
        return jsonRes({ code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' }, 406);
      }
      return jsonRes(filas);
    }
    if (tabla === 'mensajes' && metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `*/${estado.noLeidos}` } });
    if (tabla === 'perfiles') return jsonRes(estado.perfiles);
    if (tabla === 'suscripciones_push' && metodo === 'GET') return jsonRes(filtrar(estado.suscripciones, params));
    if (tabla === 'suscripciones_push' && metodo === 'DELETE') {
      const borrar = filtrar(estado.suscripciones, params).map((s) => s.id);
      estado.suscripciones = estado.suscripciones.filter((s) => !borrar.includes(s.id));
      estado.borradas = borrar;
      return new Response(null, { status: 204 });
    }
    return jsonRes({ message: `ruta no simulada ${metodo} ${url.pathname}` }, 404);
  }
  // Servicio de avisos
  const cuerpo = Buffer.from(init.body);
  estado.entregas.push({ endpoint: url.href, cabeceras: Object.fromEntries(h.entries()), cuerpo });
  const status = estado.respuestaServicio[url.host] ?? 201;
  return new Response(status >= 400 ? 'error simulado' : null, { status });
};

/* ---------------- Deno simulado ---------------- */
let manejador = null;
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => (manejador = h) };
await import(pathToFileURL(salida).href);

/* ---------------- Utilidades de prueba ---------------- */
let total = 0;
const fallos = [];
function ok(cond, texto) {
  total += 1;
  console.log(`${cond ? '  ✓' : '  ✗'} ${texto}`);
  if (!cond) fallos.push(texto);
}
async function llamar(cuerpo, token = 'jwt-jampier', metodo = 'POST') {
  const cabeceras = { 'Content-Type': 'application/json', apikey: 'sb_publishable_x', Origin: 'https://eyj.pages.dev' };
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  const res = await manejador(new Request('https://proyecto.supabase.co/functions/v1/enviar-push', { method: metodo, headers: cabeceras, body: metodo === 'POST' ? JSON.stringify(cuerpo) : undefined }));
  const texto = await res.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    /* no es JSON */
  }
  return { status: res.status, json, cors: res.headers.get('access-control-allow-origin') };
}
function descifrar(entrega, cel) {
  const texto = ece.decrypt(entrega.cuerpo, { version: 'aes128gcm', privateKey: cel.ecdh, authSecret: cel.auth });
  return JSON.parse(texto.toString('utf8'));
}
function verificarVapid(entrega) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(entrega.cabeceras.authorization || '');
  if (!m) return { ok: false };
  const [cab, carga, firma] = m[1].split('.');
  const pub = Buffer.from(m[2], 'base64url');
  const clave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
  const valida = crypto.verify('sha256', Buffer.from(`${cab}.${carga}`), { key: clave, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url'));
  return { ok: valida, k: m[2], cabecera: JSON.parse(Buffer.from(cab, 'base64url')), claims: JSON.parse(Buffer.from(carga, 'base64url')) };
}
const celPorEndpoint = (e) => Object.values(celulares).find((c) => c.fila.endpoint === e);

/* ---------------- Pruebas ---------------- */
console.log('1) Permisos y validaciones');
reiniciar();
let r = await llamar({}, null, 'OPTIONS');
ok(r.status === 200 && r.cors === '*', 'responde la verificación previa del navegador (CORS)');
r = await llamar({ mensaje_id: estado.mensajes[0].id }, null);
ok(r.status === 401, 'sin sesión: 401');
r = await llamar({ mensaje_id: estado.mensajes[0].id }, 'jwt-falso');
ok(r.status === 401, 'sesión falsa: 401');
r = await llamar({ mensaje_id: estado.mensajes[0].id }, 'sb_publishable_x');
ok(r.status === 401, 'una clave en vez de sesión: 401');
r = await llamar({ mensaje_id: 'no-es-uuid' });
ok(r.status === 400, 'mensaje_id inválido: 400');
r = await llamar({ mensaje_id: estado.mensajes[3].id });
ok(r.status === 200 && r.json.omitido === 'ya-avisado-o-no-es-tuyo' && estado.entregas.length === 0, 'no se puede avisar por un mensaje de la otra persona');
ok(estado.cabecerasSupabase.every((c) => c.apikey === SECRETA), 'usa la clave secreta nueva (SUPABASE_SECRET_KEYS) en el apikey');

console.log('2) Aviso discreto a 3 celulares (uno ya no existe)');
reiniciar();
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 200 && r.json.enviados === 2 && r.json.caducadas === 1, `respuesta: ${JSON.stringify(r.json)}`);
ok(estado.mensajes[0].notificado_en !== null, 'el mensaje queda marcado como avisado');
ok(JSON.stringify(estado.borradas) === '[3]', 'el celular que ya no existe se borró solo');
ok(estado.entregas.length === 3 && !estado.entregas.some((e) => e.endpoint.includes('de-jampier')), 'no se le avisa a quien envió');
for (const e of estado.entregas.filter((x) => !x.endpoint.includes('gone'))) {
  const servicio = new URL(e.endpoint).host;
  const aviso = descifrar(e, celPorEndpoint(e.endpoint));
  ok(aviso.titulo === 'E ❤ J' && aviso.cuerpo === 'Tienes 3 mensajes nuevos 💌' && aviso.no_leidos === 3, `${servicio}: se descifra bien y es discreto → "${aviso.titulo} · ${aviso.cuerpo}"`);
  const v = verificarVapid(e);
  ok(v.ok && v.cabecera.alg === 'ES256' && v.k === vapid.publicKey, `${servicio}: firma VAPID válida`);
  ok(v.claims.aud === `https://${servicio}` && v.claims.sub === 'mailto:jx@ejemplo.com' && v.claims.exp - Date.now() / 1000 <= 24 * 3600, `${servicio}: aud/sub/exp correctos (${v.claims.sub})`);
  ok(e.cabeceras['content-encoding'] === 'aes128gcm' && e.cabeceras.ttl === '86400' && e.cabeceras.urgency === 'high', `${servicio}: cabeceras Web Push correctas`);
  ok(e.cuerpo.length < 4096, `${servicio}: tamaño ${e.cuerpo.length} bytes (límite 4096)`);
}
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.json.omitido === 'ya-avisado-o-no-es-tuyo' && estado.entregas.length === 3, 'llamar dos veces no duplica el aviso');

console.log('3) Aviso con texto (cuando ella lo activa en Ajustes)');
reiniciar();
estado.perfiles[1].notif_con_texto = true;
await llamar({ mensaje_id: estado.mensajes[0].id });
let aviso = descifrar(estado.entregas.find((e) => e.endpoint === celulares.android.fila.endpoint), celulares.android);
ok(aviso.titulo === 'Jampier' && aviso.cuerpo === 'Hola mi amor, ¿cómo amaneciste? ☀️', `texto → "${aviso.titulo}: ${aviso.cuerpo}"`);
estado.entregas = [];
await llamar({ mensaje_id: estado.mensajes[2].id });
aviso = descifrar(estado.entregas.find((e) => e.endpoint === celulares.android.fila.endpoint), celulares.android);
ok(aviso.cuerpo === '🎤 Nota de voz (1:14)', `nota de voz → "${aviso.cuerpo}"`);
estado.entregas = [];
await llamar({ mensaje_id: estado.mensajes[1].id });
aviso = descifrar(estado.entregas.find((e) => e.endpoint === celulares.android.fila.endpoint), celulares.android);
ok(aviso.titulo === '💌 Jampier te extraña' && aviso.vibrar.length === 5, `Te extraño → "${aviso.titulo} · ${aviso.cuerpo}"`);

console.log('4) Cuándo NO se avisa');
reiniciar();
estado.perfiles[1].en_app = true;
estado.perfiles[1].visto_en = new Date(Date.now() - 5000).toISOString();
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.json.omitido === 'pareja-en-la-app' && estado.entregas.length === 0, 'si ella tiene la app abierta, no se manda aviso');
reiniciar();
estado.perfiles[1].en_app = true; // quedó "en la app" pero hace 2 minutos que no da señales
estado.perfiles[1].visto_en = new Date(Date.now() - 120000).toISOString();
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.json.enviados === 2, 'si cerró la app sin avisar (señal vieja), sí se avisa');
reiniciar();
r = await llamar({ mensaje_id: estado.mensajes[4].id });
ok(r.json.omitido === 'muy-antiguo' && estado.entregas.length === 0, 'un mensaje de hace 13 horas ya no genera aviso');
reiniciar();
estado.mensajes[0].leido_en = new Date().toISOString();
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.json.omitido === 'ya-leido-o-borrado', 'si ya lo leyó, no se avisa');

console.log('5) Fallas pasajeras y configuración');
reiniciar();
estado.respuestaServicio = { 'fcm.googleapis.com': 503, 'web.push.apple.com': 500, 'updates.push.services.mozilla.com': 410 };
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 503 && estado.mensajes[0].notificado_en === null, 'si los servicios fallan, se libera el mensaje para reintentar');
estado.respuestaServicio = { 'fcm.googleapis.com': 201, 'web.push.apple.com': 201 };
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 200 && r.json.enviados === 2, 'el reintento funciona');
// Una función recién publicada SIN los secretos VAPID (nueva instancia del módulo)
reiniciar();
const privada = env.VAPID_PRIVATE_KEY;
delete env.VAPID_PRIVATE_KEY;
await import(`${pathToFileURL(salida).href}?instancia=sin-vapid`);
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 500 && /VAPID/.test(r.json?.error ?? '') && estado.mensajes[0].notificado_en === null, `sin claves VAPID: error claro y no marca nada ("${r.json?.error}")`);
env.VAPID_PRIVATE_KEY = privada;
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 200 && r.json.enviados === 2, 'al poner la clave, funciona sin reiniciar la función');

// Proyecto con las claves clásicas (solo SUPABASE_SERVICE_ROLE_KEY)
reiniciar();
const nuevas = env.SUPABASE_SECRET_KEYS;
delete env.SUPABASE_SECRET_KEYS;
env.SUPABASE_SERVICE_ROLE_KEY = SECRETA;
await import(`${pathToFileURL(salida).href}?instancia=clasica`);
r = await llamar({ mensaje_id: estado.mensajes[0].id });
ok(r.status === 200 && r.json.enviados === 2 && estado.cabecerasSupabase.every((c) => c.apikey === SECRETA), 'también funciona con la clave clásica SUPABASE_SERVICE_ROLE_KEY');
env.SUPABASE_SECRET_KEYS = nuevas;
delete env.SUPABASE_SERVICE_ROLE_KEY;

console.log(`\n${total - fallos.length}/${total} pruebas superadas`);
if (fallos.length) {
  console.log('FALLARON:\n - ' + fallos.join('\n - '));
  process.exit(1);
}
console.log('FUNCIÓN DE AVISOS: TODO OK');
