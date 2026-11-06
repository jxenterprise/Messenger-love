// La Edge Function corriendo en Deno real, contra un Supabase simulado por HTTP.
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ece = require('http_ece');
const webpush = require('web-push');
const [, , deno, archivo, denoDir] = process.argv;

const PUERTO = 54329;
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRETA = 'sb_secret_e2e';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MID = 'aaaaaaaa-0000-4000-8000-000000000001';
const vapid = webpush.generateVAPIDKeys();

const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const auth = crypto.randomBytes(16);
const mensaje = { id: MID, remitente: A, tipo: 'imagen', contenido: 'Mira este atardecer 🌅', media_meta: { ancho: 1200, alto: 900 }, borrado: false, leido_en: null, notificado_en: null, creado_en: new Date().toISOString() };
const perfiles = [
  { id: A, nombre: 'Jampier', notif_con_texto: false, en_app: true, visto_en: new Date().toISOString() },
  { id: B, nombre: 'Estrellita', notif_con_texto: true, en_app: false, visto_en: null },
];
let subs = [
  { id: 1, endpoint: `${BASE}/push/celular-estrellita`, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  { id: 2, endpoint: `${BASE}/push/celular-viejo`, p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
];
const entregas = [];
const apikeys = new Set();

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, BASE);
  const trozos = [];
  req.on('data', (t) => trozos.push(t));
  req.on('end', () => {
    const cuerpo = Buffer.concat(trozos);
    const json = (o, s = 200, h = {}) => {
      res.writeHead(s, { 'content-type': 'application/json', ...h });
      res.end(o === null ? '' : JSON.stringify(o));
    };
    if (url.pathname.startsWith('/push/')) {
      entregas.push({ endpoint: url.href, cabeceras: req.headers, cuerpo });
      res.writeHead(url.pathname.endsWith('viejo') ? 410 : 201);
      return res.end();
    }
    apikeys.add(req.headers.apikey);
    if (req.headers.apikey !== SECRETA) return json({ message: 'Invalid API key' }, 401);
    if (url.pathname === '/auth/v1/user') {
      return req.headers.authorization === 'Bearer jwt-jampier' ? json({ id: A, aud: 'authenticated', role: 'authenticated' }) : json({ msg: 'invalid JWT' }, 403);
    }
    if (url.pathname === '/rest/v1/mensajes' && req.method === 'PATCH') {
      const cambios = JSON.parse(cuerpo.toString());
      const coincide = url.searchParams.get('id') === `eq.${MID}` && url.searchParams.get('remitente') === `eq.${A}`;
      const sinAvisar = url.searchParams.get('notificado_en') !== 'is.null' || mensaje.notificado_en === null;
      if (coincide && sinAvisar) {
        Object.assign(mensaje, cambios);
        return (req.headers.accept || '').includes('vnd.pgrst.object') ? json(mensaje) : json([mensaje]);
      }
      // Como PostgREST real: lista vacía, o 406 solo si se pidió un objeto
      return (req.headers.accept || '').includes('vnd.pgrst.object')
        ? json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'JSON object requested, multiple (or no) rows returned' }, 406)
        : json([]);
    }
    if (url.pathname === '/rest/v1/mensajes' && req.method === 'HEAD') return json(null, 200, { 'content-range': '*/1' });
    if (url.pathname === '/rest/v1/perfiles') return json(perfiles);
    if (url.pathname === '/rest/v1/suscripciones_push' && req.method === 'GET') return json(subs);
    if (url.pathname === '/rest/v1/suscripciones_push' && req.method === 'DELETE') {
      subs = subs.filter((s) => !url.searchParams.get('id').includes(String(s.id)));
      res.writeHead(204);
      return res.end();
    }
    json({ message: 'no simulado' }, 404);
  });
});
await new Promise((r) => servidor.listen(PUERTO, '127.0.0.1', r));

const proceso = spawn(deno, ['run', '--allow-net', '--allow-env', archivo], {
  env: {
    ...process.env,
    DENO_DIR: denoDir,
    NO_COLOR: '1',
    SUPABASE_URL: BASE,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA }),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:jx@ejemplo.com',
  },
});
let registro = '';
proceso.stdout.on('data', (d) => (registro += d));
proceso.stderr.on('data', (d) => (registro += d));
for (let i = 0; i < 300 && !/Listening on/i.test(registro); i++) await new Promise((r) => setTimeout(r, 200));
if (!/Listening on/i.test(registro)) {
  console.log('Deno no arrancó:\n' + registro);
  process.exit(1);
}
const puertoDeno = /:(\d+)\//.exec(registro.match(/Listening on [^\n]+/)[0])?.[1] ?? '8000';

let fallos = 0;
const ok = (c, t) => {
  console.log(`${c ? '  ✓' : '  ✗'} ${t}`);
  if (!c) fallos += 1;
};
const llamar = (token, cuerpo) =>
  fetch(`http://127.0.0.1:${puertoDeno}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

console.log(`Deno ${registro.match(/Listening on [^\n]+/)[0]}`);
const pre = await fetch(`http://127.0.0.1:${puertoDeno}/`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'authorization, x-client-info, apikey, content-type' } });
ok(pre.status === 200 && pre.headers.get('access-control-allow-headers').includes('x-client-info'), 'CORS en Deno');
ok((await llamar(null, { mensaje_id: MID })).status === 401, 'sin sesión: 401');
const r = await llamar('jwt-jampier', { mensaje_id: MID });
ok(r.status === 200 && r.json.enviados === 1 && r.json.caducadas === 1, `respuesta en Deno: ${JSON.stringify(r.json)}`);
ok([...apikeys].every((k) => k === SECRETA), 'Deno usa la clave secreta en el apikey');
const e = entregas.find((x) => x.endpoint.endsWith('estrellita'));
const aviso = JSON.parse(ece.decrypt(e.cuerpo, { version: 'aes128gcm', privateKey: ecdh, authSecret: auth }).toString());
ok(aviso.titulo === 'Jampier' && aviso.cuerpo === '📷 Mira este atardecer 🌅', `cifrado de Deno descifrado con http_ece → "${aviso.titulo}: ${aviso.cuerpo}"`);
const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(e.cabeceras.authorization);
const [h, c, f] = t.split('.');
const pub = Buffer.from(k, 'base64url');
const clave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: clave, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')), 'firma VAPID hecha en Deno es válida');
ok(subs.length === 1, 'el celular viejo (410) se borró');
const r2 = await llamar('jwt-jampier', { mensaje_id: MID });
ok(r2.json.omitido === 'ya-avisado-o-no-es-tuyo' && entregas.length === 2, `no duplica en Deno: ${JSON.stringify(r2)} entregas=${entregas.length}`);

if (fallos) console.log('--- registro de Deno ---\n' + registro.slice(-1500));
proceso.kill();
servidor.close();
console.log(fallos ? `\n${fallos} FALLAS` : '\nDENO: TODO OK');
process.exit(fallos ? 1 : 0);
