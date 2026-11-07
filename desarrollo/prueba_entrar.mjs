// ============================================================================
//  Prueba la Edge Function "entrar-con-pin" en Node
// ----------------------------------------------------------------------------
//  · La función se empaqueta como la corre Supabase (Deno + supabase-js real).
//  · verificar_acceso lo responde un PostgreSQL de verdad (PGlite) con
//    supabase/01_estructura.sql cargado: así se prueba la función y la base
//    de datos juntas, con el bloqueo por intentos incluido.
//  · Los servicios de cuentas de Supabase (Auth) se imitan.
//
//  Uso: node prueba_entrar.mjs   (o: npm run prueba:entrar)
// ============================================================================
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const aqui = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));
const salida = aqui('./entrar-empaquetada.mjs');

await build({
  entryPoints: [aqui('../supabase/functions/entrar-con-pin/index.ts')],
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

let pruebas = 0;
const fallos = [];
function ok(condicion, texto) {
  pruebas += 1;
  console.log(`${condicion ? '  ✓ ' : '  ✗ '}${texto}`);
  if (!condicion) fallos.push(texto);
}

/* ---------- Base de datos real con las 2 cuentas y el PIN 7391 ---------- */
const db = await PGlite.create({ extensions: { pgcrypto } });
await db.exec(readFileSync(aqui('./supabase_simulado.sql'), 'utf8'));
await db.exec(readFileSync(aqui('../supabase/01_estructura.sql'), 'utf8'));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CORREOS = { [A]: 'jampier@eyj.app', [B]: 'jx+estrellita@gmail.com' };
await db.exec('set role supabase_auth_admin');
for (const [id, correo] of Object.entries(CORREOS)) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, correo]);
await db.exec('reset role');
await db.query("select privado.poner_pin('7391')");

/* ---------- Supabase imitado ---------- */
const URL_SB = 'https://proyecto.supabase.co';
const SECRETA = 'sb_secret_prueba123';
const registro = [];
let authCaido = false;

globalThis.fetch = async (entrada, opciones = {}) => {
  const url = new URL(typeof entrada === 'string' ? entrada : entrada.url);
  const cabeceras = new Headers(opciones.headers);
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
  registro.push({ ruta: url.pathname, apikey: cabeceras.get('apikey'), cuerpo });
  const json = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { 'Content-Type': 'application/json' } });

  if (cabeceras.get('apikey') !== SECRETA) return json({ message: 'clave equivocada' }, 401);

  if (url.pathname === '/rest/v1/rpc/verificar_acceso') {
    // Como PostgREST: con el rol del servidor (service_role)
    const r = await db.transaction(async (tx) => {
      await tx.query('set local role service_role');
      return tx.query('select public.verificar_acceso($1, $2) as r', [cuerpo.p_usuario, cuerpo.p_pin]);
    });
    return json(r.rows[0].r);
  }
  const usuario = url.pathname.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
  if (usuario) {
    if (authCaido) return json({ message: 'caído' }, 500);
    return json({ id: usuario[1], email: CORREOS[usuario[1]], aud: 'authenticated' });
  }
  if (url.pathname === '/auth/v1/admin/generate_link') {
    // Forma real de la respuesta de Supabase Auth
    return json({
      id: 'x',
      email: cuerpo.email,
      action_link: `${URL_SB}/auth/v1/verify?token=abc&type=magiclink`,
      email_otp: '123456',
      hashed_token: `pase-para-${cuerpo.email}`,
      redirect_to: 'http://localhost',
      verification_type: 'magiclink',
    });
  }
  return json({ message: `ruta no imitada ${url.pathname}` }, 404);
};

globalThis.Deno = {
  env: { get: (k) => ({ SUPABASE_URL: URL_SB, SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETA }) })[k] },
  serve: () => {},
};

const { manejar } = await import(pathToFileURL(salida).href);
const llamar = async (cuerpo, metodo = 'POST') => {
  const res = await manejar(
    new Request(`${URL_SB}/functions/v1/entrar-con-pin`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Origin: 'https://messenger-estrellita-jampier-18.pages.dev' },
      body: metodo === 'POST' ? (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)) : undefined,
    }),
  );
  return { estado: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), datos: res.status === 204 ? null : await res.json().catch(() => null) };
};

console.log('1) Entrar');
let r = await llamar({ usuario: 'jampier', pin: '7391' });
ok(r.estado === 200 && r.datos.ok === true && r.datos.token_hash === 'pase-para-jampier@eyj.app', 'jampier + PIN correcto → devuelve el pase de su cuenta');
ok(r.datos.version === 1, 'y la versión del PIN');
ok(r.cors === '*', 'la web puede leer la respuesta (CORS)');
r = await llamar({ usuario: ' Estrellita ', pin: '7391' });
ok(r.datos.ok === true && r.datos.token_hash === 'pase-para-jx+estrellita@gmail.com', 'estrellita entra con el mismo PIN (mayúsculas y espacios no importan)');
const enlaces = registro.filter((x) => x.ruta === '/auth/v1/admin/generate_link');
ok(enlaces.every((x) => x.cuerpo.type === 'magiclink'), 'pide un enlace mágico (no se envía ningún correo)');
ok(registro.every((x) => x.apikey === SECRETA), 'usa la clave secreta del servidor (SUPABASE_SECRET_KEYS)');

console.log('2) Datos equivocados');
r = await llamar({ usuario: 'jampier', pin: '0000' });
ok(r.datos.ok === false && r.datos.motivo === 'datos' && r.datos.restantes === 14 && !r.datos.token_hash, 'PIN equivocado: no hay pase y dice cuántos intentos quedan');
r = await llamar({ usuario: 'nadie', pin: '7391' });
ok(r.datos.ok === false && r.datos.motivo === 'datos' && r.datos.restantes === undefined, 'usuario que no existe: mismo mensaje, sin pistas');
const antes = registro.length;
for (const malo of [{ usuario: 'jampier', pin: '12a4' }, { usuario: 'jampier', pin: 7391 }, { usuario: 'x', pin: '7391' }, {}]) {
  r = await llamar(malo);
  ok(r.estado === 200 && r.datos.motivo === 'datos', `datos mal formados (${JSON.stringify(malo)}) → rechazados`);
}
r = await llamar('esto no es json');
ok(r.datos.motivo === 'datos', 'cuerpo que no es JSON → rechazado');
ok(registro.length === antes, 'lo mal formado ni siquiera llega a la base de datos');

console.log('3) Bloqueo por intentos');
for (let i = 0; i < 4; i++) r = await llamar({ usuario: 'jampier', pin: '1111' });
ok(r.datos.motivo === 'esperar' && r.datos.segundos === 900, '5 fallos → esperar 15 minutos');
r = await llamar({ usuario: 'jampier', pin: '7391' });
ok(r.datos.ok === false && r.datos.motivo === 'esperar' && !r.datos.token_hash, 'mientras espera, el PIN correcto no da pase');
ok((await llamar({ usuario: 'estrellita', pin: '7391' })).datos.ok === true, 'la otra cuenta sigue entrando');
await db.query("update privado.acceso_intentos set fallos = 14, esperar_hasta = null where usuario = $1", [A]);
r = await llamar({ usuario: 'jampier', pin: '1111' });
ok(r.datos.motivo === 'bloqueado', '15 fallos → bloqueada');
await db.query('select privado.desbloquear()');
ok((await llamar({ usuario: 'jampier', pin: '7391' })).datos.ok === true, 'desbloqueada desde el SQL Editor: entra de nuevo');

console.log('4) Otros casos');
ok((await llamar(null, 'GET')).estado === 405, 'solo acepta POST');
const pre = await manejar(new Request(`${URL_SB}/functions/v1/entrar-con-pin`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'authorization, apikey, content-type' } }));
ok(pre.status === 200 && pre.headers.get('Access-Control-Allow-Headers').includes('apikey'), 'responde la consulta previa del navegador (CORS)');
authCaido = true;
const errorOriginal = console.error;
console.error = () => {};
r = await llamar({ usuario: 'jampier', pin: '7391' });
console.error = errorOriginal;
ok(r.estado === 500 && r.datos.ok === false && !r.datos.token_hash, 'si Supabase Auth falla: error claro y sin pase');
authCaido = false;
ok(Number((await db.query('select fallos from privado.acceso_intentos where usuario = $1', [A])).rows[0].fallos) === 0, 'un error del servidor no cuenta como intento fallido');

console.log(`\n${pruebas - fallos.length}/${pruebas} pruebas superadas`);
if (fallos.length) {
  console.log(`FALLARON:\n - ${fallos.join('\n - ')}`);
  process.exit(1);
}
console.log('FUNCIÓN ENTRAR CON PIN: TODO OK');
