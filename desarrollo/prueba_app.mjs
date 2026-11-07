// ============================================================================
//  Prueba la app completa en modo demo (celular y computador)
// ----------------------------------------------------------------------------
//  Entra, envía texto, emoji de amor, responde, graba una nota de voz (con el
//  micrófono falso del navegador), envía una foto, recibe y envía un
//  "Te extraño", cambia el tema, abre ajustes, busca y bloquea con el PIN.
//  Deja capturas en desarrollo/capturas/.
//
//  Uso (desde desarrollo/): node prueba_app.mjs   (o: npm run prueba:app)
// ============================================================================
import { abrirNavegador, aqui, carpetaCapturas, crearRevisor, levantarWeb, nuevoContexto, vigilarConsola } from './apoyo_navegador.mjs';

const { ok, terminar } = crearRevisor();
const capturas = carpetaCapturas();
const web = await levantarWeb();
const navegador = await abrirNavegador();
const foto = aqui('../web/img/demo/atardecer.webp');

try {
  console.log('1) Celular: entrar y conversar');
  const contexto = await nuevoContexto(navegador);
  await contexto.grantPermissions(['microphone', 'notifications'], { origin: web.url.replace(/\/$/, '') });
  const p = await contexto.newPage();
  const errores = vigilarConsola(p);
  await p.goto(web.url, { waitUntil: 'networkidle' });
  await p.waitForSelector('#pantalla-entrada:not([hidden])');
  await p.screenshot({ path: `${capturas}app-01-entrada.png` });
  await p.fill('#usuario', 'jampier');
  await p.fill('#pin-entrada', '1234');
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  await p.waitForTimeout(2200);
  ok((await p.$$('#mensajes .fila')).length >= 10, 'se ve la conversación de ejemplo');
  await p.screenshot({ path: `${capturas}app-02-chat-claro.png` });

  const antes = (await p.$$('#mensajes .fila.suya')).length;
  await p.fill('#entrada-mensaje', 'Hola mi amor, ¿cómo vas? www.ejemplo.com');
  await p.click('#boton-principal');
  await p.waitForTimeout(7000);
  ok((await p.$$('#mensajes .fila.suya')).length > antes, 'envío un mensaje y la pareja de ejemplo responde');
  ok((await p.$$('#mensajes .fila.mia a[href="https://www.ejemplo.com"]')).length === 1, 'los enlaces quedan como enlaces');
  await p.screenshot({ path: `${capturas}app-03-respuesta.png` });

  await p.fill('#entrada-mensaje', '❤️');
  await p.click('#boton-principal');
  await p.waitForTimeout(600);
  ok((await p.$$('.lluvia-corazones, .corazon-lluvia, [class*="lluvia"]')).length > 0, 'un ❤️ solo hace llover corazones');
  await p.screenshot({ path: `${capturas}app-04-lluvia.png` });
  await p.waitForTimeout(4500);

  console.log('2) Responder, nota de voz y foto');
  const suyas = await p.$$('#mensajes .fila.suya');
  await suyas.at(-1).click({ button: 'right' });
  await p.waitForSelector('.hoja');
  await p.screenshot({ path: `${capturas}app-05-menu-mensaje.png` });
  await p.click('.hoja [data-accion="responder"]');
  await p.waitForTimeout(300);
  ok(await p.isVisible('.barra-contexto'), 'responder a un mensaje muestra la cita arriba del teclado');
  await p.fill('#entrada-mensaje', 'Te respondo a esto 😘');
  await p.click('#boton-principal');
  await p.waitForTimeout(1500);
  ok((await p.$$('#mensajes .fila.mia .cita')).length >= 1, 'la respuesta lleva la cita');

  await p.click('#boton-principal'); // sin texto = grabar nota de voz
  await p.waitForTimeout(2600);
  ok(await p.isVisible('#barra-grabacion'), 'graba una nota de voz');
  await p.screenshot({ path: `${capturas}app-06-grabando.png` });
  await p.click('#enviar-grabacion');
  await p.waitForTimeout(2000);
  ok((await p.$$('#mensajes .fila.mia .nota-voz')).length >= 1, 'la nota de voz queda en el chat');

  await p.setInputFiles('#selector-fotos', foto);
  await p.waitForSelector('.previa-fotos');
  await p.fill('#pie-foto', 'Mira esta foto 🌅');
  await p.screenshot({ path: `${capturas}app-07-previa-foto.png` });
  await p.click('.previa-fotos [data-enviar]');
  await p.waitForTimeout(2500);
  ok((await p.$$('#mensajes .fila.mia .marco-foto')).length >= 1, 'la foto (comprimida a WebP) queda en el chat');
  await p.screenshot({ path: `${capturas}app-08-con-foto.png` });

  console.log('3) "Te extraño"');
  try {
    await p.waitForSelector('.capa-te-extrano', { timeout: 30000 });
    ok(true, 'llega un "Te extraño" de la pareja con su pantalla especial');
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${capturas}app-09-te-extrano-recibido.png` });
    await p.click('.capa-te-extrano [data-cerrar]');
    await p.waitForTimeout(400);
  } catch {
    ok(false, 'llega un "Te extraño" de la pareja con su pantalla especial');
  }
  await p.click('#boton-te-extrano');
  await p.waitForTimeout(1200);
  ok((await p.$$('#mensajes .fila.mia .te-extrano')).length >= 1, 'envío un "Te extraño"');

  console.log('4) Tema, ajustes, búsqueda y bloqueo');
  await p.click('#boton-tema');
  await p.waitForTimeout(600);
  ok((await p.getAttribute('html', 'data-theme')) === 'dark', 'el botón cambia a modo oscuro');
  await p.screenshot({ path: `${capturas}app-10-chat-oscuro.png` });
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="ajustes"]');
  await p.waitForSelector('.panel');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${capturas}app-11-ajustes-oscuro.png`, fullPage: true });
  await p.click('.panel [data-cerrar]');
  await p.waitForTimeout(300);
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="buscar"]');
  await p.waitForSelector('#texto-busqueda');
  await p.fill('#texto-busqueda', 'amor');
  await p.waitForTimeout(900);
  ok((await p.$$('.resultado')).length >= 1, 'la búsqueda encuentra mensajes');
  await p.screenshot({ path: `${capturas}app-12-busqueda.png` });
  await p.click('.resultado');
  await p.waitForTimeout(1200);
  await p.click('#boton-tema');
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="bloquear"]');
  await p.waitForSelector('#pantalla-pin:not([hidden])');
  for (const d of '9999') await p.click(`#teclado [data-digito="${d}"]`);
  await p.waitForTimeout(600);
  await p.screenshot({ path: `${capturas}app-13-pin-incorrecto.png` });
  for (const d of '1234') await p.click(`#teclado [data-digito="${d}"]`);
  await p.waitForSelector('#pantalla-pin', { state: 'hidden', timeout: 5000 }).catch(() => {});
  ok(!(await p.isVisible('#pantalla-pin')), 'bloquear y abrir con el PIN');
  ok(errores.length === 0, `celular: sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  console.log('5) Computador (modo oscuro, teclado)');
  const escritorio = await nuevoContexto(navegador, { escritorio: true, oscuro: true });
  const pc = await escritorio.newPage();
  const erroresPc = vigilarConsola(pc);
  await pc.goto(web.url, { waitUntil: 'networkidle' });
  await pc.click('[data-demo="estrellita"]');
  await pc.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  await pc.waitForTimeout(1800);
  await pc.hover('#mensajes .fila.mia .burbuja >> nth=-1');
  await pc.screenshot({ path: `${capturas}app-14-pc-oscuro.png` });
  await pc.click('#boton-emojis');
  await pc.waitForTimeout(300);
  ok(await pc.isVisible('#panel-emojis'), 'panel de emojis en el computador');
  await pc.screenshot({ path: `${capturas}app-15-pc-emojis.png` });
  await pc.keyboard.press('Escape');
  await pc.click('#boton-menu');
  await pc.click('.hoja [data-accion="bloquear"]');
  await pc.waitForSelector('#pantalla-pin:not([hidden])');
  for (const d of '1234') await pc.keyboard.press(d);
  await pc.waitForSelector('#pantalla-pin', { state: 'hidden', timeout: 5000 }).catch(() => {});
  ok(!(await pc.isVisible('#pantalla-pin')), 'en el computador el PIN se escribe con el teclado');
  ok(erroresPc.length === 0, `computador: sin errores en la consola ${erroresPc.length ? JSON.stringify(erroresPc) : ''}`);
  await escritorio.close();
} finally {
  await navegador.close();
  web.cerrar();
}
terminar('APP EN EL NAVEGADOR');
