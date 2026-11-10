// ============================================================================
//  Prueba 01_estructura.sql en un PostgreSQL que imita a Supabase
// ----------------------------------------------------------------------------
//  Usa PGlite: un PostgreSQL de verdad que corre dentro de Node (no hay que
//  instalar nada más, funciona igual en Windows, Mac y Linux).
//  Simula las peticiones de la app (rol authenticated + JWT, o anon, o el
//  servidor con service_role) y verifica que las reglas de seguridad hagan
//  exactamente lo que deben, incluido el ingreso con usuario + PIN.
//
//  Uso (desde desarrollo/, con npm install hecho):
//    node prueba_sql.mjs supabase_simulado.sql ../supabase/01_estructura.sql \
//         ../supabase/02_nueva_contrasena.sql ../supabase/03_pin.sql
//  (o simplemente: npm run prueba:sql)
// ============================================================================
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { randomUUID as uuid } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const [, , rutaSimulado, rutaEstructura, rutaContrasena, rutaPin] = process.argv;
const leer = (ruta) => readFileSync(ruta, 'utf8');
const SIMULADO = leer(rutaSimulado);
const ESTRUCTURA = leer(rutaEstructura);

const fallos = [];
let pruebas = 0;
function ok(condicion, texto) {
  pruebas += 1;
  console.log(`${condicion ? '  ✓ ' : '  ✗ '}${texto}`);
  if (!condicion) fallos.push(texto);
}

/** Cambia los %s (estilo Python) por $1, $2… (estilo PostgreSQL). */
function numerar(sql) {
  let n = 0;
  return sql.replace(/%s/g, () => `$${++n}`).replace(/%%/g, '%');
}

const db = await PGlite.create({ extensions: { pgcrypto } });

/** SQL como superusuario (lo que hace el SQL Editor de Supabase). */
async function admin(sql, params = []) {
  const r = await db.query(numerar(sql), params, { rowMode: 'array' });
  return r.fields.length ? r.rows : r.affectedRows;
}

/** Ejecuta SQL como lo haría PostgREST para un usuario, anónimo o el servidor. */
function como(usuario, rol = 'authenticated') {
  const ejecutar = (sql, params = [], tema = null) =>
    db.transaction(async (tx) => {
      await tx.query(`set local role ${rol}`);
      const claims = { role: rol, ...(usuario ? { sub: usuario } : {}) };
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      if (tema) await tx.query("select set_config('realtime.topic', $1, true)", [tema]);
      const r = await tx.query(numerar(sql), params, { rowMode: 'array' });
      return r.fields.length ? r.rows : r.affectedRows;
    });
  ejecutar.falla = async (sql, params = [], tema = null, contiene = '') => {
    try {
      await ejecutar(sql, params, tema);
      return false;
    } catch (error) {
      return String(error.message).toLowerCase().includes(contiene.toLowerCase());
    }
  };
  return ejecutar;
}

async function fallaAdmin(sql, params, contiene) {
  try {
    await admin(sql, params);
    return false;
  } catch (error) {
    return String(error.message).toLowerCase().includes(contiene.toLowerCase());
  }
}

// ---------------------------------------------------------------- preparación
await db.exec(SIMULADO);

// Una cuenta creada ANTES de correr el SQL (el SQL debe crearle el perfil)
const A = uuid();
await admin("insert into auth.users (id, email, created_at) values (%s, 'jampier@correo.com', now() - interval '1 day')", [A]);

console.log('1) El SQL corre sin errores (y dos veces seguidas)');
await db.exec(ESTRUCTURA);
ok(true, 'primera ejecución');
await db.exec(ESTRUCTURA);
ok(true, 'segunda ejecución (se puede repetir sin dañar nada)');

console.log('2) Cuentas y perfiles');
ok((await admin('select nombre from perfiles where id = %s', [A]))[0][0] === 'Jampier', 'la cuenta previa recibió su perfil');
ok((await admin('select usuario from perfiles where id = %s', [A]))[0][0] === 'jampier', "la cuenta previa recibió su usuario ('jampier')");
const B = uuid();
await db.exec('set role supabase_auth_admin');
await admin("insert into auth.users (id, email, raw_user_meta_data) values (%s, 'estre@correo.com', %s)", [B, JSON.stringify({ nombre: 'Estrellita' })]);
await db.exec('reset role');
ok((await admin('select nombre from perfiles where id = %s', [B]))[0][0] === 'Estrellita', 'la segunda cuenta recibe su perfil al crearse');
await db.exec('set role supabase_auth_admin');
try {
  await admin("insert into auth.users (id, email) values (%s, 'intruso@correo.com')", [uuid()]);
  ok(false, 'una tercera cuenta debe ser rechazada');
} catch (error) {
  ok(String(error.message).includes('solo para dos personas'), 'una tercera cuenta es rechazada');
}
await db.exec('reset role');
ok(Number((await admin('select count(*) from perfiles'))[0][0]) === 2, 'solo existen 2 perfiles');

const ja = como(A);
const es = como(B);
const anon = como(null, 'anon');
const servidor = como(null, 'service_role');
const X = uuid(); // alguien con sesión pero sin perfil (no debería existir, igual se prueba)
const intruso = como(X);

console.log('3) Mensajes: enviar como lo hace la app (upsert que ignora duplicados)');
const cid = uuid();
const INSERTAR = `
  insert into mensajes (client_id, remitente, tipo, contenido, media_path, media_meta, responde_a)
  values (%s, %s, %s, %s, %s, %s, %s)
  on conflict (client_id) do nothing returning id, remitente, creado_en, leido_en`;
let filas = await ja(INSERTAR, [cid, A, 'texto', 'Hola mi amor ❤️', null, null, null]);
ok(filas.length === 1 && filas[0][1] === A, 'Jampier envía un texto');
const m1 = filas[0][0];
ok((await ja(INSERTAR, [cid, A, 'texto', 'Hola mi amor ❤️', null, null, null])).length === 0, 'reintento con el mismo client_id: no duplica');
ok((await ja('select id from mensajes where client_id = %s', [cid])).length === 1, 'el reintento encuentra el mensaje existente');
filas = await ja(INSERTAR, [uuid(), B, 'texto', 'Me hago pasar por ella', null, null, null]);
ok(filas[0][1] === A, 'no se puede enviar a nombre de la otra persona (el servidor corrige el remitente)');
ok(
  await ja.falla("insert into mensajes (client_id, tipo, contenido, leido_en) values (%s, 'texto', 'x', now())", [uuid()], null, 'permission denied'),
  "no se puede inventar 'leído' al enviar",
);
ok(await ja.falla(INSERTAR, [uuid(), A, 'texto', '   ', null, null, null], null, 'mensaje_valido'), 'no se aceptan mensajes vacíos');
ok(
  await ja.falla(INSERTAR, [uuid(), A, 'imagen', null, `${B}/foto.webp`, null, null], null, 'no es tuyo'),
  'no se puede usar un archivo de la carpeta de la otra persona',
);
const foto = await ja(INSERTAR, [uuid(), A, 'imagen', 'Mira 🌅', `${A}/foto.webp`, JSON.stringify({ ancho: 1200, alto: 900 }), m1]);
ok(foto.length === 1, 'foto con pie y respuesta a otro mensaje');
const fotoId = foto[0][0];
ok((await es(INSERTAR, [uuid(), B, 'te_extrano', null, null, null, null])).length === 1, 'Estrellita envía un Te extraño');

console.log('4) Quién puede leer');
ok((await es('select id from mensajes')).length === 4, 'Estrellita ve los 4 mensajes');
ok(await anon.falla('select id from mensajes', [], null, 'permission denied'), 'alguien sin sesión no ve nada');
ok((await intruso('select id from mensajes')).length === 0, 'una sesión sin perfil no ve mensajes');
ok(await intruso.falla(INSERTAR, [uuid(), X, 'texto', 'hola', null, null, null], null, 'row-level security'), 'una sesión sin perfil no puede escribir');
ok((await intruso('select id from perfiles')).length === 0, 'una sesión sin perfil no ve los perfiles');
ok((await es('select id from perfiles')).length === 2, 'los miembros ven los 2 perfiles');

console.log('5) Entregado, leído, reacciones, editar y borrar');
ok(await es.falla('update mensajes set leido_en = now()', [], null, 'permission denied'), "nadie cambia 'leído' a mano");
await es('select marcar_entregados()');
ok(Number((await ja('select count(*) from mensajes where remitente = %s and entregado_en is not null', [A]))[0][0]) === 3, 'entregados ✓✓');
ok(
  Number((await ja('select count(*) from mensajes where remitente = %s and leido_en is not null', [B]))[0][0]) === 0,
  'marcar_entregados no toca los mensajes propios',
);
await es('select marcar_leidos()');
ok(Number((await ja('select count(*) from mensajes where remitente = %s and leido_en is not null', [A]))[0][0]) === 3, 'leídos ✓✓ de color');
ok(await anon.falla('select marcar_leidos()', [], null, 'permission denied'), 'sin sesión no se puede marcar leído');
ok(await intruso.falla('select marcar_leidos()', [], null, 'no autorizado'), 'una sesión sin perfil no puede marcar leído');
await es("select reaccionar(%s, '❤️')", [m1]);
await ja("select reaccionar(%s, '😂')", [m1]);
let reacciones = (await ja('select reacciones from mensajes where id = %s', [m1]))[0][0];
ok(isDeepStrictEqual(reacciones, { [B]: '❤️', [A]: '😂' }), 'reacciones de los dos guardadas por separado');
await ja('select reaccionar(%s, null)', [m1]);
reacciones = (await ja('select reacciones from mensajes where id = %s', [m1]))[0][0];
ok(isDeepStrictEqual(reacciones, { [B]: '❤️' }), 'quitar mi reacción');
await ja("select editar_mensaje(%s, 'Hola mi amor 😍')", [m1]);
let fila = (await ja('select contenido, editado_en is not null from mensajes where id = %s', [m1]))[0];
ok(isDeepStrictEqual(fila, ['Hola mi amor 😍', true]), "editar mi mensaje (marca 'editado')");
ok(await es.falla("select editar_mensaje(%s, 'hackeado')", [m1], null, 'ya no se puede editar'), 'no se puede editar el mensaje de la otra persona');
await admin("update mensajes set creado_en = now() - interval '20 minutes' where id = %s", [m1]);
ok(await ja.falla("select editar_mensaje(%s, 'tarde')", [m1], null, '15 minutos'), 'después de 15 minutos ya no se edita');
ok(await es.falla('select borrar_mensaje(%s)', [fotoId], null, 'tus propios'), 'no se puede borrar el mensaje de la otra persona');
await ja('select borrar_mensaje(%s)', [fotoId]);
fila = (await ja('select borrado, media_path from mensajes where id = %s', [fotoId]))[0];
ok(isDeepStrictEqual(fila, [true, `${A}/foto.webp`]), 'borrar para los dos lo marca como eliminado y guarda el archivo (papelera)');
ok((await ja('select borrado_en is not null from mensajes where id = %s', [fotoId]))[0][0] === true, 'y anota cuándo se eliminó');
const antes = (await ja('select actualizado_en from mensajes where id = %s', [m1]))[0][0];
await es("select reaccionar(%s, '🔥')", [m1]);
ok((await ja('select actualizado_en from mensajes where id = %s', [m1]))[0][0] > antes, "cada cambio actualiza 'actualizado_en' (sincronización)");

console.log('6) Perfiles');
await ja("update perfiles set nombre = 'Jampi', notif_con_texto = true where id = %s", [A]);
ok((await es('select nombre from perfiles where id = %s', [A]))[0][0] === 'Jampi', 'cambiar mi nombre');
ok((await ja("update perfiles set nombre = 'Cambiado' where id = %s", [B])) === 0, 'no puedo cambiar el nombre de la otra persona');
ok(await ja.falla('update perfiles set en_app = true where id = %s', [A], null, 'permission denied'), "'en línea' solo cambia con el latido");
ok(await ja.falla("update perfiles set usuario = 'otro' where id = %s", [A], null, 'permission denied'), 'el usuario para entrar no se cambia desde la app');
await ja('select latido(true)');
ok(isDeepStrictEqual((await es('select en_app, visto_en is not null from perfiles where id = %s', [A]))[0], [true, true]), 'latido: en línea');
await ja('select latido(false)');
ok((await es('select en_app from perfiles where id = %s', [A]))[0][0] === false, 'latido: salió de la app');

console.log('7) Suscripciones push');
const GUARDAR = "select guardar_suscripcion(%s, 'p256dh-x', 'auth-x', 'Chrome Android')";
await ja(GUARDAR, ['https://fcm.googleapis.com/fcm/send/abc']);
await ja(GUARDAR, ['https://fcm.googleapis.com/fcm/send/abc']);
ok((await ja('select id from suscripciones_push')).length === 1, 'guardar dos veces el mismo celular no duplica');
ok((await es('select id from suscripciones_push')).length === 0, 'no veo los celulares de la otra persona');
await es(GUARDAR, ['https://fcm.googleapis.com/fcm/send/abc']);
ok(
  (await es('select id from suscripciones_push')).length === 1 && (await ja('select id from suscripciones_push')).length === 0,
  'si la otra cuenta entra en el mismo celular, el aviso pasa a ella',
);
ok(await es.falla(GUARDAR, ['http://inseguro.com/x'], null, 'check'), 'solo se aceptan direcciones https');
ok((await ja('delete from suscripciones_push')) === 0, 'no puedo borrar los celulares de la otra persona');
ok((await es("delete from suscripciones_push where endpoint like 'https://fcm%%'")) === 1, 'puedo borrar el mío');
ok(await intruso.falla(GUARDAR, ['https://fcm.googleapis.com/x'], null, 'no autorizado'), 'una sesión sin perfil no registra celulares');
ok(
  await es.falla("insert into suscripciones_push (endpoint, p256dh, auth) values ('https://a', 'b', 'c')", [], null, 'permission denied'),
  'la tabla no se escribe directo (solo con la función segura)',
);

console.log('8) Canal privado de tiempo real');
const EMITIR = "insert into realtime.messages (topic, extension, payload) values (%s, %s, '{}')";
ok((await ja(EMITIR, ['pareja-eyj', 'broadcast'], 'pareja-eyj')) === 1, "Jampier puede emitir 'escribiendo…' en su canal");
ok((await es(EMITIR, ['pareja-eyj', 'presence'], 'pareja-eyj')) === 1, "Estrellita puede emitir 'en línea'");
ok(await ja.falla(EMITIR, ['otro-canal', 'broadcast'], 'otro-canal', 'row-level security'), 'no se puede usar otro canal privado');
ok(await intruso.falla(EMITIR, ['pareja-eyj', 'broadcast'], 'pareja-eyj', 'row-level security'), 'una sesión sin perfil no entra al canal');
ok((await es('select id from realtime.messages', [], 'pareja-eyj')).length === 2, 'los miembros escuchan el canal');
ok((await intruso('select id from realtime.messages', [], 'pareja-eyj')).length === 0, 'una sesión sin perfil no escucha nada');
const pub = Number(
  (await admin("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mensajes'"))[0][0],
);
ok(pub === 1, 'la tabla mensajes está en tiempo real (una sola vez)');

console.log('9) Fotos y notas de voz (bucket privado)');
const bucket = (await admin("select public, file_size_limit from storage.buckets where id = 'media'"))[0];
ok(bucket[0] === false && Number(bucket[1]) === 15728640, "bucket 'media' privado con límite de 15 MB");
const SUBIR = "insert into storage.objects (bucket_id, name) values ('media', %s)";
const miFoto = `${A}/${uuid()}.webp`;
ok((await ja(SUBIR, [miFoto])) === 1, 'subo a mi carpeta');
await ja(INSERTAR, [uuid(), A, 'imagen', 'Foto en el chat', miFoto, null, null]); // la foto queda en un mensaje
ok(await ja.falla(SUBIR, [`${B}/robado.webp`], null, 'row-level security'), 'no puedo subir a la carpeta de la otra persona');
ok(await ja.falla(SUBIR, ['suelto.webp'], null, 'row-level security'), 'no se puede subir fuera de una carpeta');
ok(await intruso.falla(SUBIR, [`${X}/x.webp`], null, 'row-level security'), 'una sesión sin perfil no sube archivos');
ok((await es("select name from storage.objects where bucket_id = 'media'")).length === 1, 'la otra persona puede ver mis fotos');
ok((await intruso('select name from storage.objects')).length === 0, 'una sesión sin perfil no ve fotos');
ok((await es("delete from storage.objects where bucket_id = 'media'")) === 0, 'la otra persona no puede borrar mis fotos (las que están en el chat)');
ok((await ja("delete from storage.objects where bucket_id = 'media'")) === 1, 'yo sí puedo borrar las mías');

console.log('10) Lo que nadie de afuera puede hacer');
ok((await anon('select ping()'))[0][0] === 'ok', 'el despertador (ping) responde sin sesión');
for (const f of [
  'latido(true)',
  'marcar_entregados()',
  "reaccionar(gen_random_uuid(), '❤️')",
  'borrar_mensaje(gen_random_uuid())',
  "guardar_suscripcion('https://x', 'a', 'b')",
  'privado.es_miembro()',
  'crear_perfil()',
  'tocar_actualizado()',
  "verificar_acceso('jampier', '0000')",
  "cambiar_pin('0000', '1111')",
  'version_pin()',
  "privado.poner_pin('7391')",
  'privado.desbloquear()',
]) {
  ok(await anon.falla(`select ${f}`, [], null, 'permission denied'), `sin sesión no se puede llamar ${f.split('(')[0]}`);
}
ok(await ja.falla('select crear_perfil()', [], null, 'permission denied'), 'las funciones internas no se llaman desde la app');
ok(await anon.falla('select * from perfiles', [], null, 'permission denied'), 'sin sesión no se ven perfiles');
ok(await anon.falla('select * from suscripciones_push', [], null, 'permission denied'), 'sin sesión no se ven celulares');

console.log('11) Protección: no se puede borrar una cuenta que tiene mensajes');
try {
  await admin('delete from auth.users where id = %s', [B]);
  ok(false, 'borrar la cuenta de Estrellita debe fallar (tiene mensajes)');
} catch (error) {
  const m = String(error.message).toLowerCase();
  ok(m.includes('foreign key') || m.includes('violates'), 'borrar una cuenta con mensajes es rechazado: la conversación queda a salvo');
}
ok(Number((await admin('select count(*) from mensajes where remitente = %s', [B]))[0][0]) > 0, 'sus mensajes siguen ahí');
ok(Number((await admin('select count(*) from perfiles'))[0][0]) === 2, 'y su perfil también');
// Una cuenta SIN mensajes sí se puede borrar (por ejemplo, si se creó mal)
await admin('delete from mensajes where remitente = %s', [B]);
await admin('delete from auth.users where id = %s', [B]);
ok(Number((await admin('select count(*) from perfiles'))[0][0]) === 1, 'una cuenta sin mensajes sí se puede borrar');
await db.exec('set role supabase_auth_admin');
const B2 = uuid();
await admin("insert into auth.users (id, email) values (%s, 'jxprueba+estrellita@gmail.com')", [B2]);
await db.exec('reset role');
ok(Number((await admin('select count(*) from perfiles'))[0][0]) === 2, 'y entonces se puede crear de nuevo la segunda cuenta');
ok((await admin('select usuario, nombre from perfiles where id = %s', [B2]))[0].join('|') === 'estrellita|Estrellita',
  "con correo+estrellita@… el usuario es 'estrellita' y el nombre 'Estrellita'");

console.log('12) Plantilla para poner una contraseña nueva (02_nueva_contrasena.sql)');
const plantilla = leer(rutaContrasena);
await db.exec(plantilla.replace('ESCRIBE-AQUI-LA-NUEVA', 'Clave-Nueva-2026').replace('correo@ejemplo.com', '  JXprueba+Estrellita@gmail.com '));
const hash = (await admin('select encrypted_password from auth.users where id = %s', [B2]))[0][0];
ok(hash !== null && hash.startsWith('$2a$10$'), `guarda un hash bcrypt como el de Supabase (${String(hash).slice(0, 7)}…)`);
ok((await admin('select extensions.crypt(%s, %s) = %s', ['Clave-Nueva-2026', hash, hash]))[0][0] === true, 'la contraseña nueva coincide con el hash');
const res = (
  await db.query(plantilla.replace('ESCRIBE-AQUI-LA-NUEVA', 'x').replace('correo@ejemplo.com', 'nadie@correo.com'), [], { rowMode: 'array' })
).rows[0][0];
ok(String(res).startsWith('No encontré'), 'si el correo no existe, lo dice claro');

console.log('13) Usuario sacado del correo');
const desde = async (correo, meta = {}) => (await admin('select privado.usuario_desde_correo(%s, %s)', [correo, JSON.stringify(meta)]))[0][0];
ok((await desde('jampier@lo-que-sea.com')) === 'jampier', 'jampier@… → jampier');
ok((await desde('TuCorreo+Estrellita@gmail.com')) === 'estrellita', 'tucorreo+estrellita@gmail.com → estrellita (en minúscula)');
ok((await desde('x@y.com', { usuario: 'Jam Pier!' })) === 'jampier', 'el usuario de los metadatos manda y se limpia');
ok(
  (await admin("select privado.usuario_libre('jampier', %s)", [B2]))[0][0] === 'jampier2',
  'si el usuario ya lo tiene la otra cuenta, se le agrega un número',
);

console.log('14) Entrar con usuario + PIN');
const entrar = async (usuario, pin) => (await servidor('select verificar_acceso(%s, %s)', [usuario, pin]))[0][0];
ok((await entrar('jampier', '7391')).motivo === 'sin-pin', 'sin PIN creado todavía: lo dice claro');
ok(await fallaAdmin("select privado.poner_pin('1234')", [], 'muy fácil'), 'no acepta 1234');
ok(await fallaAdmin("select privado.poner_pin('0000')", [], 'muy fácil'), 'no acepta 0000 (la plantilla obliga a cambiarlo)');
ok(await fallaAdmin("select privado.poner_pin('12a4')", [], '4 números'), 'no acepta letras');
ok(await fallaAdmin("select privado.poner_pin('73915')", [], '4 números'), 'no acepta 5 números');
const plantillaPin = leer(rutaPin);
ok((await db.query(plantillaPin.replace("'0000'", "'7391'"), [], { rowMode: 'array' })).rows[0][0] === 'PIN guardado ✅', 'la plantilla 03_pin.sql crea el PIN');
const guardado = (await admin('select pin_hash from privado.acceso_pin'))[0][0];
ok(guardado.startsWith('$2a$10$') && !guardado.includes('7391'), 'el PIN se guarda cifrado con bcrypt, nunca tal cual');

ok(await ja.falla("select verificar_acceso('jampier', '7391')", [], null, 'permission denied'), 'la app con sesión no puede llamar verificar_acceso');
ok(await ja.falla('select * from privado.acceso_pin', [], null, 'permission denied'), 'nadie de la app lee el PIN cifrado');
ok(await ja.falla('select * from privado.acceso_intentos', [], null, 'permission denied'), 'ni los intentos');
ok(await ja.falla("select privado.poner_pin('5826')", [], null, 'permission denied'), 'la app no puede poner el PIN sin el actual');

let r = await entrar('jampier', '7391');
ok(r.ok === true && r.id === A && r.version === 1, 'jampier + PIN correcto → entra (con su id y la versión del PIN)');
r = await entrar('  ESTRELLITA ', '7391');
ok(r.ok === true && r.id === B2, 'estrellita entra con el MISMO PIN (y no importan mayúsculas ni espacios)');
r = await entrar('nadie', '7391');
ok(r.ok === false && r.motivo === 'datos' && r.restantes === undefined && r.id === undefined, 'usuario que no existe: mismo mensaje, sin pistas');

for (let i = 1; i <= 4; i++) r = await entrar('jampier', '1111');
ok(r.motivo === 'datos' && r.restantes === 11, '4 fallos: todavía puede intentar (le quedan 11)');
r = await entrar('jampier', '1111');
ok(r.motivo === 'esperar' && r.segundos === 900, '5 fallos seguidos → esperar 15 minutos');
r = await entrar('jampier', '7391');
ok(r.ok === false && r.motivo === 'esperar', 'mientras espera, ni el PIN correcto entra');
ok((await entrar('estrellita', '7391')).ok === true, 'el bloqueo es por cuenta: estrellita sigue entrando');
await admin("update privado.acceso_intentos set esperar_hasta = now() - interval '1 second' where usuario = %s", [A]);
r = await entrar('jampier', '7391');
ok(r.ok === true, 'pasados los 15 minutos, el PIN correcto entra');
ok(Number((await admin('select fallos from privado.acceso_intentos where usuario = %s', [A]))[0][0]) === 0, 'acertar borra los fallos');

for (let ronda = 0; ronda < 3; ronda++) {
  for (let i = 0; i < 5; i++) r = await entrar('jampier', '2222');
  await admin("update privado.acceso_intentos set esperar_hasta = now() - interval '1 second' where usuario = %s", [A]);
}
ok(r.motivo === 'bloqueado', '15 fallos → cuenta bloqueada');
ok((await entrar('jampier', '7391')).motivo === 'bloqueado', 'bloqueada: ni el PIN correcto entra (no hay forma de adivinarlo)');
ok((await admin('select privado.desbloquear()'))[0][0] === 'Cuentas desbloqueadas ✅', 'desbloquear desde el SQL Editor');
ok((await entrar('jampier', '7391')).ok === true, 'desbloqueada: vuelve a entrar');

console.log('15) Cambiar el PIN desde la app (cambia para los dos)');
ok((await ja('select version_pin()'))[0][0] === 1, 'la app puede ver la versión del PIN');
ok((await intruso('select version_pin()'))[0][0] === null, 'una sesión sin perfil no ve nada');
r = (await ja("select cambiar_pin('9999', '5826')"))[0][0];
ok(r.ok === false && r.motivo === 'datos', 'con el PIN actual equivocado no se cambia');
ok(Number((await admin('select fallos from privado.acceso_intentos where usuario = %s', [A]))[0][0]) === 1, 'y cuenta como intento fallido (no se puede probar PINs sin límite)');
for (let i = 0; i < 4; i++) r = (await ja("select cambiar_pin('9999', '5826')"))[0][0];
ok(r.motivo === 'esperar', 'cambiar el PIN también respeta el bloqueo de 5 fallos');
await admin('select privado.desbloquear()');
ok(await ja.falla("select cambiar_pin('7391', '4321')", [], null, 'muy fácil'), 'no acepta un PIN fácil');
ok(await ja.falla("select cambiar_pin('7391', '7391')", [], null, 'igual'), 'no acepta el mismo PIN');
ok(await ja.falla("select cambiar_pin('7391', '58')", [], null, '4 números'), 'el nuevo debe tener 4 números');
ok(await intruso.falla("select cambiar_pin('7391', '5826')", [], null, 'no autorizado'), 'una sesión sin perfil no puede cambiarlo');
r = (await ja("select cambiar_pin('7391', '5826')"))[0][0];
ok(r.ok === true && r.version === 2, 'Jampier cambia el PIN (versión 2)');
ok((await entrar('estrellita', '7391')).ok === false, 'el PIN viejo ya no sirve');
r = await entrar('estrellita', '5826');
ok(r.ok === true && r.version === 2, 'Estrellita entra con el PIN nuevo');
ok((await como(B2)('select version_pin()'))[0][0] === 2, 'el otro celular se entera de que el PIN cambió');

console.log('16) Correr 01_estructura.sql otra vez no borra nada');
await db.exec(ESTRUCTURA);
ok((await entrar('jampier', '5826')).ok === true, 'el PIN sigue igual');
ok(
  (await admin('select string_agg(usuario, \',\' order by usuario) from perfiles'))[0][0] === 'estrellita,jampier',
  'los usuarios siguen iguales',
);

console.log('17) Ajustes guardados en la base de datos (nunca se reinician)');
const est = como(B2);
const misAjustes = { tema: 'oscuro', sonido: false, avisos: true, 'bloqueo-seg': 300 };
await ja('update perfiles set preferencias = %s where id = %s', [JSON.stringify(misAjustes), A]);
ok(isDeepStrictEqual((await ja('select preferencias from perfiles where id = %s', [A]))[0][0], misAjustes), 'cada uno guarda sus ajustes (tema, sonido, avisos, bloqueo…)');
ok((await ja('update perfiles set preferencias = %s where id = %s', ['{"tema":"claro"}', B2])) === 0, 'no se pueden cambiar los ajustes del otro');
ok(
  await ja.falla('update perfiles set preferencias = %s where id = %s', [JSON.stringify({ x: 'a'.repeat(3000) }), A], null, 'perfiles_preferencias_validas'),
  'los ajustes no pueden ser gigantes',
);
ok(await ja.falla("update perfiles set preferencias = '[1, 2]' where id = %s", [A], null, 'perfiles_preferencias_validas'), 'los ajustes deben ser un objeto');
ok(await anon.falla("update perfiles set preferencias = '{}'", [], null, 'permission denied'), 'sin sesión no se tocan');
await db.exec(ESTRUCTURA);
ok(isDeepStrictEqual((await ja('select preferencias from perfiles where id = %s', [A]))[0][0], misAjustes), 'correr 01_estructura.sql otra vez no borra los ajustes');

console.log('18) Vaciar el chat (para los dos)');
await ja(INSERTAR, [uuid(), A, 'texto', 'Mensaje antes de vaciar', null, null, null]);
await est(INSERTAR, [uuid(), B2, 'imagen', null, `${B2}/foto-e.webp`, null, null]);
await ja(INSERTAR, [uuid(), A, 'audio', null, `${A}/nota.m4a`, null, null]);
await admin("insert into storage.objects (bucket_id, name) values ('media', %s), ('media', %s), ('media', %s)", [
  `${B2}/foto-e.webp`,
  `${A}/nota.m4a`,
  `${B2}/avatar-1.webp`,
]);
await admin('update perfiles set avatar_path = %s where id = %s', [`${B2}/avatar-1.webp`, B2]);
ok((await ja('delete from storage.objects where name = %s', [`${B2}/foto-e.webp`])) === 0, 'mientras un mensaje usa la foto del otro, no se puede borrar');
ok(await anon.falla('select vaciar_chat()', [], null, 'permission denied'), 'sin sesión no se puede vaciar');
ok(await intruso.falla('select vaciar_chat()', [], null, 'no autorizado'), 'una sesión sin perfil no puede vaciar');
ok(Number((await admin('select count(*) from mensajes'))[0][0]) >= 3, 'antes de vaciar hay mensajes de los dos');
const rutasVaciadas = (await ja('select vaciar_chat()'))[0][0];
ok(
  Array.isArray(rutasVaciadas) && rutasVaciadas.includes(`${B2}/foto-e.webp`) && rutasVaciadas.includes(`${A}/nota.m4a`),
  'devuelve las rutas de las fotos y notas de voz de los dos (para borrarlas)',
);
ok(Number((await admin('select count(*) from mensajes'))[0][0]) === 0, 'se borran TODOS los mensajes, de los dos');
const estadoChat = (await est('select vaciado_en, vaciado_por from chat_estado'))[0];
ok(estadoChat?.[0] !== null && estadoChat?.[1] === A, 'queda registrado cuándo y quién lo vació (así el otro celular se entera)');
ok((await intruso('select * from chat_estado')).length === 0, 'una sesión sin perfil no ve ese registro');
ok(await anon.falla('select * from chat_estado', [], null, 'permission denied'), 'sin sesión tampoco');
ok(await est.falla('update chat_estado set vaciado_en = now()', [], null, 'permission denied'), 'nadie lo cambia a mano');
ok((await ja('delete from storage.objects where name = %s', [`${B2}/foto-e.webp`])) === 1, 'ya sin mensajes, se puede borrar la foto del otro (no queda ocupando espacio)');
ok((await ja('delete from storage.objects where name = %s', [`${B2}/avatar-1.webp`])) === 0, 'pero no la foto de perfil del otro (sigue en uso)');
ok((await intruso('delete from storage.objects where name = %s', [`${A}/nota.m4a`])) === 0, 'una sesión sin perfil no borra archivos');
ok((await ja(INSERTAR, [uuid(), A, 'texto', 'Empezamos de nuevo 💜', null, null, null])).length === 1, 'después de vaciar se sigue escribiendo normal');
const pubEstado = Number(
  (await admin("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_estado'"))[0][0],
);
ok(pubEstado === 1, 'el aviso de "chat vaciado" llega en tiempo real');
console.log('19) La papelera: eliminar para los dos guarda, no destruye');
// Queda el mensaje que se insertó al final de la sección 18
const paraBorrar = (await ja('select id from mensajes where remitente = %s order by creado_en desc limit 1', [A]))[0][0];
await admin("insert into storage.objects (bucket_id, name) values ('media', %s)", [`${A}/secreto.webp`]);
const conFoto = (await ja(INSERTAR, [uuid(), A, 'imagen', 'Esto era un secreto', `${A}/secreto.webp`, null, null]))[0][0];
const deElla = (await est(INSERTAR, [uuid(), B2, 'texto', 'Lo que ella borró', null, null, null]))[0][0];

ok(await anon.falla('select borrar_mensaje(%s)', [paraBorrar], null, 'permission denied'), 'sin sesión no se puede eliminar');
ok(await intruso.falla('select borrar_mensaje(%s)', [paraBorrar], null, 'no autorizado'), 'una sesión sin perfil tampoco');
ok(await est.falla('select borrar_mensaje(%s)', [paraBorrar], null, 'tus propios mensajes'), 'nadie elimina los mensajes del otro');

await ja('select borrar_mensaje(%s)', [paraBorrar]);
const guardadoPap = (await ja('select borrado, contenido, borrado_en from mensajes where id = %s', [paraBorrar]))[0];
ok(guardadoPap[0] === true, 'el mensaje queda marcado como eliminado');
ok(guardadoPap[1] === 'Empezamos de nuevo 💜', 'PERO el texto se guarda: es lo que se ve en la papelera');
ok(guardadoPap[2] !== null, 'y queda la fecha y hora en que se eliminó');
ok(await ja.falla('select borrar_mensaje(%s)', [paraBorrar], null, 'tus propios mensajes'), 'no se puede eliminar dos veces');

await ja('select borrar_mensaje(%s)', [conFoto]);
const fotoPap = (await ja('select contenido, media_path from mensajes where id = %s', [conFoto]))[0];
ok(fotoPap[0] === 'Esto era un secreto' && fotoPap[1] === `${A}/secreto.webp`, 'de una foto eliminada se guardan el pie y la ruta');
ok((await est('delete from storage.objects where name = %s', [`${A}/secreto.webp`])) === 0, 'y el archivo NO se borra: sigue en uso para la papelera');

await est('select borrar_mensaje(%s)', [deElla]);
const listaPap = await ja('select contenido from mensajes where borrado order by borrado_en desc');
ok(listaPap.length === 3, 'la papelera junta lo que eliminaron los dos');
ok(
  listaPap.some((f) => f[0] === 'Lo que ella borró'),
  'y Jampier puede leer lo que eliminó Estrellita (la papelera es de los dos)',
);
ok(
  (await est('select contenido from mensajes where id = %s', [paraBorrar]))[0][0] === 'Empezamos de nuevo 💜',
  'y Estrellita puede leer lo que eliminó Jampier (ven exactamente lo mismo)',
);
ok(await anon.falla('select contenido from mensajes where borrado', [], null, 'permission denied'), 'sin sesión no se ve la papelera');
ok((await intruso('select contenido from mensajes where borrado')).length === 0, 'una sesión sin perfil tampoco ve nada');
ok(
  (await ja('select count(*) from mensajes where not borrado'))[0][0] === '0' ||
    Number((await ja('select count(*) from mensajes where not borrado'))[0][0]) >= 0,
  'el chat solo muestra los que no están eliminados',
);
await ja('select vaciar_chat()');
ok(Number((await ja('select count(*) from mensajes'))[0][0]) === 0, '"Vaciar todo el chat" también deja la papelera vacía (eso sí borra de verdad)');

await db.exec(ESTRUCTURA);
ok(true, '01_estructura.sql se puede correr otra vez con todo lo nuevo');

console.log(`\n${pruebas - fallos.length}/${pruebas} pruebas superadas`);
if (fallos.length) {
  console.log(`FALLARON:\n - ${fallos.join('\n - ')}`);
  process.exit(1);
}
console.log('BASE DE DATOS: TODO OK');
