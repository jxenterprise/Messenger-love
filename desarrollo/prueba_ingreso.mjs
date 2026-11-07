// ============================================================================
//  Prueba: entrar con usuario + PIN, el bloqueo y el cambio de PIN
// ----------------------------------------------------------------------------
//  1. Modo demo (en el computador): todo el recorrido de la pantalla.
//  2. App CONECTADA a un Supabase imitado: usa la librería real de Supabase,
//     la función "entrar-con-pin" y el canje del pase (verifyOtp).
//  3. Publicada sin Supabase ("Casi listo") y con la clave secreta pegada.
//
//  Uso (desde desarrollo/): node prueba_ingreso.mjs   (o: npm run prueba:ingreso)
// ============================================================================
import { readFileSync } from 'node:fs';
import { abrirNavegador, aqui, carpetaCapturas, crearRevisor, levantarWeb, nuevoContexto, pantallasVisibles, vigilarConsola } from './apoyo_navegador.mjs';

const { ok, terminar } = crearRevisor();
const capturas = carpetaCapturas();
const web = await levantarWeb();
const DOMINIO = `http://eyj.prueba:${web.puerto}/`; // "publicada" (no es el computador de pruebas)
const navegador = await abrirNavegador([
  '--host-resolver-rules=MAP eyj.prueba 127.0.0.1',
  `--unsafely-treat-insecure-origin-as-secure=http://eyj.prueba:${web.puerto}`, // como https
]);

const escribirPin = async (pagina, digitos) => {
  for (const d of digitos) await pagina.click(`#teclado [data-digito="${d}"]`);
  await pagina.waitForTimeout(450);
};
const textoError = (pagina) => pagina.textContent('#error-entrada');

try {
  /* ======================= 1) Modo demo ======================= */
  console.log('1) Modo demo: entrar con usuario + PIN');
  let contexto = await nuevoContexto(navegador);
  let p = await contexto.newPage();
  let errores = vigilarConsola(p);
  await p.goto(web.url, { waitUntil: 'networkidle' });
  await p.waitForSelector('#pantalla-entrada:not([hidden])');
  ok(await p.isVisible('#usuario') && await p.isVisible('#pin-entrada'), 'la entrada pide usuario y PIN (ya no correo y contraseña)');
  ok(await p.isVisible('#caja-demo'), 'en el computador se ve la ayuda de la vista previa');
  ok((await p.getAttribute('#pin-entrada', 'inputmode')) === 'numeric', 'el PIN abre el teclado de números en el celular');
  await p.screenshot({ path: `${capturas}ingreso-01-entrada.png` });

  await p.fill('#usuario', 'jampier');
  await p.fill('#pin-entrada', '9999');
  await p.waitForFunction(() => document.querySelector('#error-entrada').textContent.length > 0);
  ok((await textoError(p)).includes('Usuario o PIN incorrectos'), 'PIN equivocado: "Usuario o PIN incorrectos" (entra solo al 4.º número)');
  ok((await p.inputValue('#pin-entrada')) === '', 'el PIN equivocado se borra para escribirlo de nuevo');
  await p.screenshot({ path: `${capturas}ingreso-02-pin-equivocado.png` });
  await p.fill('#pin-entrada', '12ab');
  ok((await p.inputValue('#pin-entrada')) === '12', 'el campo del PIN solo acepta números');
  await p.fill('#pin-entrada', '');
  await p.fill('#usuario', 'JAMPIER ');
  await p.fill('#pin-entrada', '1234');
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  ok(true, 'jampier + 1234 → entra directo al chat (sin pasos extra; mayúsculas y espacios no importan)');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${capturas}ingreso-03-chat.png` });

  console.log('2) Bloqueo con el mismo PIN');
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="bloquear"]');
  await p.waitForSelector('#pantalla-pin:not([hidden])');
  ok((await p.textContent('#titulo-pin')).includes('Hola, Jampier'), 'la pantalla del PIN saluda por el nombre');
  const encima = await p.evaluate(() => document.elementFromPoint(195, 420).closest('section')?.id);
  ok(encima === 'pantalla-pin', 'el PIN tapa por completo el chat');
  await escribirPin(p, '0000');
  ok((await p.textContent('#error-pin')).includes('PIN incorrecto'), 'PIN equivocado en el bloqueo: no abre');
  await p.screenshot({ path: `${capturas}ingreso-04-bloqueo.png` });
  await escribirPin(p, '1234');
  ok(await p.isVisible('#pantalla-chat') && !(await p.isVisible('#pantalla-pin')), 'con el PIN correcto se abre');

  console.log('3) Cambiar el PIN (para los dos)');
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="ajustes"]');
  await p.waitForSelector('.panel');
  ok((await p.textContent('.panel')).includes('@jampier'), 'Ajustes muestra el usuario @jampier');
  ok(!(await p.textContent('.panel')).includes('Cambiar contraseña'), 'ya no existe "Cambiar contraseña"');
  await p.click('.panel [data-accion="cambiar-pin"]');
  await p.waitForSelector('#pin-actual');
  ok((await p.textContent('.dialogo')).includes('también cambia para Estrellita'), 'avisa que el PIN cambia también para la pareja');
  await p.fill('#pin-actual', '1111');
  await p.fill('#pin-nuevo', '5826');
  await p.fill('#pin-repetido', '5826');
  await p.click('.dialogo [type="submit"]');
  await p.waitForFunction(() => document.querySelector('.dialogo .error-texto')?.textContent.length > 0);
  ok((await p.textContent('.dialogo .error-texto')).includes('no es correcto'), 'con el PIN actual equivocado no se cambia');
  await p.fill('#pin-actual', '1234');
  await p.fill('#pin-repetido', '5820');
  await p.click('.dialogo [type="submit"]');
  ok((await p.textContent('.dialogo .error-texto')).includes('no coinciden'), 'si los dos nuevos no coinciden, lo dice');
  await p.fill('#pin-repetido', '5826');
  await p.screenshot({ path: `${capturas}ingreso-05-cambiar-pin.png` });
  await p.click('.dialogo [type="submit"]');
  await p.waitForSelector('.dialogo', { state: 'detached' });
  ok(true, 'PIN cambiado a 5826');
  await p.click('.panel [data-cerrar]');
  await p.waitForTimeout(300);
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="bloquear"]');
  await p.waitForSelector('#pantalla-pin:not([hidden])');
  await escribirPin(p, '1234');
  ok(await p.isVisible('#pantalla-pin'), 'el PIN viejo ya no abre');
  await escribirPin(p, '5826');
  ok(await p.isVisible('#pantalla-chat') && !(await p.isVisible('#pantalla-pin')), 'el PIN nuevo sí abre');

  console.log('4) Si el PIN cambió en el otro celular');
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="bloquear"]');
  await p.waitForSelector('#pantalla-pin:not([hidden])');
  await p.evaluate(() => localStorage.setItem('eyj:demo:pin-version', '9'));
  await escribirPin(p, '5826');
  await p.waitForSelector('#pantalla-entrada:not([hidden])', { timeout: 5000 });
  ok((await textoError(p)).includes('El PIN se cambió'), 'pide entrar de nuevo con el PIN nuevo');
  ok((await p.inputValue('#usuario')) === 'jampier', 'recuerda el último usuario para no escribirlo otra vez');

  console.log('5) La otra cuenta y los botones rápidos');
  await p.fill('#usuario', 'estrellita');
  await p.fill('#pin-entrada', '5826');
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  ok((await p.textContent('#nombre-pareja')) === 'Jampier', 'estrellita entra con el mismo PIN y ve a Jampier como su pareja');
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="ajustes"]');
  await p.waitForSelector('.panel');
  await p.click('.panel [data-accion="salir"]');
  await p.click('.dialogo .boton.peligro');
  await p.waitForSelector('#pantalla-entrada:not([hidden])');
  ok(true, 'cerrar sesión vuelve a la entrada');
  await p.click('[data-demo="jampier"]');
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  ok(true, 'el botón "Soy Jampier" entra con el PIN de la vista previa');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 2) Conectada a Supabase (imitado) =============== */
  console.log('6) Conectada a Supabase: la función entrar-con-pin y el pase');
  const SB = 'https://abcdefghijkl.supabase.co';
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';
  const config = readFileSync(aqui('../web/js/config.js'), 'utf8')
    .replace("SUPABASE_URL: ''", `SUPABASE_URL: '${SB}'`)
    .replace("SUPABASE_KEY: ''", "SUPABASE_KEY: 'sb_publishable_prueba123'");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: A, role: 'authenticated', exp, aud: 'authenticated' })}.firma`;
  const llamadas = [];
  let funcionPublicada = true;

  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p, [/websocket/i, /realtime/i, /ERR_NAME_NOT_RESOLVED/i, /Failed to load resource/i]);
  await p.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: config }));
  await p.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await p.route(`${SB}/**`, async (r) => {
    const peticion = r.request();
    const url = new URL(peticion.url());
    const cuerpo = peticion.postDataJSON?.() ?? null;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    const json = (datos, status = 200) => r.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    if (peticion.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: cors });
    llamadas.push({ ruta: url.pathname, cuerpo, apikey: peticion.headers().apikey });
    if (url.pathname === '/functions/v1/entrar-con-pin') {
      if (!funcionPublicada) return json({ message: 'Function not found' }, 404);
      if (cuerpo.usuario === 'jampier' && cuerpo.pin === '7391') return json({ ok: true, token_hash: 'pase-123', version: 3 });
      if (cuerpo.usuario === 'estrellita') return json({ ok: false, motivo: 'esperar', segundos: 840 });
      return json({ ok: false, motivo: 'datos', restantes: 4 });
    }
    if (url.pathname === '/auth/v1/verify') {
      return json({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'refresco', user: { id: A, email: 'jampier@eyj.app', aud: 'authenticated', role: 'authenticated' } });
    }
    if (url.pathname === '/rest/v1/perfiles') {
      return json([
        { id: A, usuario: 'jampier', nombre: 'Jampier', avatar_path: null, notif_con_texto: false, en_app: true, visto_en: new Date().toISOString() },
        { id: B, usuario: 'estrellita', nombre: 'Estrellita', avatar_path: null, notif_con_texto: false, en_app: false, visto_en: new Date().toISOString() },
      ]);
    }
    if (url.pathname === '/rest/v1/mensajes') return json([]);
    if (url.pathname === '/rest/v1/rpc/version_pin') return json(3);
    if (url.pathname.startsWith('/rest/v1/rpc/')) return json(null);
    return json({ message: 'no imitado' }, 404);
  });

  await p.goto(DOMINIO, { waitUntil: 'networkidle' });
  await p.waitForSelector('#pantalla-entrada:not([hidden])');
  ok(!(await p.isVisible('#caja-demo')), 'conectada: no aparece la vista previa');
  ok(llamadas.length === 0, 'abrir la entrada no consulta nada todavía');

  funcionPublicada = false;
  await p.fill('#usuario', 'jampier');
  await p.fill('#pin-entrada', '7391');
  await p.waitForFunction(() => document.querySelector('#error-entrada').textContent.length > 0);
  ok((await textoError(p)).includes('Falta publicar la función'), 'si falta publicar la función, lo dice claro');
  funcionPublicada = true;

  await p.fill('#pin-entrada', '1111');
  await p.waitForFunction(() => document.querySelector('#error-entrada').textContent.includes('quedan'));
  ok((await textoError(p)).includes('Te quedan 4 intentos'), 'PIN equivocado: avisa cuántos intentos quedan');
  await p.fill('#usuario', 'estrellita');
  await p.fill('#pin-entrada', '7391');
  await p.waitForFunction(() => document.querySelector('#error-entrada').textContent.includes('Espera'));
  ok((await textoError(p)).includes('Espera 14 minutos'), 'en espera por intentos: dice cuántos minutos faltan');

  await p.fill('#usuario', 'jampier');
  await p.fill('#pin-entrada', '7391');
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 10000 });
  ok(true, 'jampier + PIN correcto → entra al chat conectado');
  const alaFuncion = llamadas.filter((l) => l.ruta === '/functions/v1/entrar-con-pin').at(-1);
  ok(alaFuncion.cuerpo.usuario === 'jampier' && alaFuncion.cuerpo.pin === '7391', 'manda usuario y PIN a la función entrar-con-pin');
  ok(alaFuncion.apikey === 'sb_publishable_prueba123', 'con la clave pública (nunca la secreta)');
  const canje = llamadas.find((l) => l.ruta === '/auth/v1/verify');
  ok(canje?.cuerpo?.token_hash === 'pase-123' && canje.cuerpo.type === 'email', 'cambia el pase por la sesión (verifyOtp tipo email)');
  ok(llamadas.some((l) => l.ruta === '/rest/v1/perfiles'), 'después carga los perfiles con la sesión');
  await p.waitForTimeout(800);
  ok((await p.textContent('#nombre-pareja')) === 'Estrellita', 've a Estrellita como su pareja');
  const guardado = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('eyj:pin:')).map((k) => localStorage.getItem(k)));
  ok(guardado.length === 1 && !guardado[0].includes('7391') && guardado[0].includes('huella'), 'el PIN queda en el celular solo cifrado (para el bloqueo sin señal)');
  ok((await p.evaluate(() => localStorage.getItem('eyj:pin-version'.replace('version', `version:${'11111111-1111-4111-8111-111111111111'}`)))) === '3', 'guarda la versión del PIN');
  await p.screenshot({ path: `${capturas}ingreso-06-conectada.png` });
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 3) Publicada sin Supabase / clave secreta =============== */
  console.log('7) Publicada sin Supabase ("Casi listo") y clave secreta');
  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await p.goto(DOMINIO, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.querySelector('#pantalla-carga').hidden);
  ok(JSON.stringify(await pantallasVisibles(p)) === '["pantalla-conexion"]', 'sin datos de Supabase: solo "Casi listo" (sin bot)');
  ok((await p.textContent('#conexion-pendiente')).includes('usuario y el PIN'), 'dice que se entrará con usuario y PIN');
  await p.click('#enlace-demo');
  await p.waitForSelector('#caja-demo:not([hidden])');
  ok(true, 'el botón de vista previa abre el demo');
  ok(errores.length === 0, 'sin errores en la consola');
  await contexto.close();

  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  await p.route('**/js/config.js', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: config.replace('sb_publishable_prueba123', 'sb_secret_abc123') }),
  );
  await p.goto(`${DOMINIO}?demo`, { waitUntil: 'networkidle' });
  await p.waitForFunction(() => document.querySelector('#pantalla-carga').hidden);
  ok(await p.isVisible('#conexion-peligro'), 'con la clave SECRETA: aviso rojo y la app no la usa (ni con ?demo)');
  await contexto.close();
} finally {
  await navegador.close();
  web.cerrar();
}
terminar('INGRESO CON USUARIO + PIN');
