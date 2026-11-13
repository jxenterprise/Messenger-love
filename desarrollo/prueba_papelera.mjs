// ============================================================================
//  Prueba la Papelera (/papelera): la página aparte con los mensajes eliminados
// ----------------------------------------------------------------------------
//  · Entra al chat, elimina un mensaje propio y comprueba que en el chat se
//    ve como "Se eliminó este mensaje" pero en la Papelera sale completo.
//  · Comprueba que la Papelera es de LOS DOS: lo que elimina una persona lo
//    ve la otra (se entra con las dos cuentas).
//  · Comprueba el PIN, el filtro, el aviso al eliminar y que sin sesión la
//    página no muestra nada (pide entrar al chat).
//
//  Uso (desde desarrollo/): node prueba_papelera.mjs  (o: npm run prueba:papelera)
// ============================================================================
import { abrirNavegador, carpetaCapturas, crearRevisor, levantarWeb, nuevoContexto, vigilarConsola } from './apoyo_navegador.mjs';

const { ok, terminar } = crearRevisor();
const capturas = carpetaCapturas();
const web = await levantarWeb();
const navegador = await abrirNavegador();

const entrar = async (p, persona, pin = '1234') => {
  await p.goto(web.url, { waitUntil: 'networkidle' });
  await p.waitForSelector('#pantalla-entrada:not([hidden])');
  await p.click(`[data-persona="${persona}"]`);
  await p.fill('#pin-entrada', pin);
  await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  await p.waitForTimeout(1500);
};

/** Abre la papelera y pasa el PIN si lo pide. Devuelve los textos de la lista. */
const abrirPapelera = async (p, { porMenu = false } = {}) => {
  if (porMenu) {
    await p.click('#boton-menu');
    await p.click('.hoja [data-accion="papelera"]');
    await p.waitForURL('**/papelera/', { timeout: 10000 }); // el menú navega a la otra página
  } else {
    await p.goto(`${web.url}papelera/`, { waitUntil: 'networkidle' });
  }
  await p.waitForFunction(() => !document.querySelector('#estado-cargando') || document.querySelector('#estado-cargando').hidden, null, { timeout: 15000 });
  if (!(await p.isHidden('#estado-pin'))) {
    await p.fill('#campo-pin', '1234');
    await p.waitForSelector('#estado-lista:not([hidden]), #estado-vacio:not([hidden])', { timeout: 10000 });
  }
};

try {
  /* =============== 1) La papelera de la vista previa =============== */
  console.log('1) La papelera con los mensajes de ejemplo');
  let contexto = await nuevoContexto(navegador);
  let p = await contexto.newPage();
  let errores = vigilarConsola(p);
  await entrar(p, 'jampier');

  ok((await p.$$('#mensajes .fila.borrado, #mensajes .burbuja.borrado')).length >= 3, 'en el chat los eliminados salen como "Se eliminó este mensaje" (también el de antes de la papelera)');
  const enElChat = await p.textContent('#mensajes');
  ok(!enElChat.includes('eso no era para ti'), 'el chat NO muestra lo que decía un mensaje eliminado');

  await abrirPapelera(p, { porMenu: true });
  ok(p.url().includes('/papelera'), 'el menú ⋮ → Papelera abre la página /papelera');
  ok(await p.isVisible('#estado-lista'), 'la papelera muestra la lista');
  const texto = await p.textContent('#lista');
  ok(texto.includes('eso no era para ti'), 'la papelera SÍ muestra lo que decía el mensaje que eliminó Estrellita');
  ok(texto.includes('Mejor te lo digo en persona'), 'y también el que eliminó Jampier');
  ok((await p.textContent('#resumen')).includes('3'), 'el resumen dice cuántos hay');
  ok((await p.textContent('#lista')).includes('Eliminado'), 'cada uno dice cuándo se eliminó');
  ok((await p.$$('.eliminado')).length === 3, 'hay una tarjeta por mensaje eliminado (textos y foto)');
  ok(!texto.includes('hace tiempo'), 'lo eliminado ANTES de la papelera (sin fecha ni texto) ya no sale');
  ok(/Eliminado (hoy|ayer|el )/.test(texto), 'el día se lee natural: "Eliminado ayer", "Eliminado el lunes"…');
  const vacias = await p.$$eval('.eliminado .contenido', (cs) => cs.filter((c) => !c.querySelector('.texto, img, audio')).length);
  ok(vacias === 0, 'ninguna tarjeta queda vacía');
  await p.screenshot({ path: `${capturas}papelera-01-lista.png`, fullPage: true });

  // Filtro
  const filtros = await p.$$('#filtros [data-valor]');
  ok(filtros.length === 3, 'hay filtros: todos, míos y los de la pareja');
  await p.click('#filtros [data-valor="mios"]');
  await p.waitForTimeout(300);
  ok((await p.$$('.eliminado')).length === 1, 'el filtro "Míos" deja solo los de Jampier');
  ok((await p.textContent('#lista')).includes('Mejor te lo digo en persona'), 'y es el correcto');
  await p.click('#filtros [data-valor="todos"]');
  await p.waitForTimeout(300);
  ok((await p.$$('.eliminado')).length === 3, 'vuelve a mostrarlos todos');

  // Filtro "Qué ver": textos / fotos
  const tipos = await p.$$eval('#filtros-tipo [data-tipo]', (bs) => bs.map((b) => b.dataset.tipo));
  ok(tipos.join(',') === 'todo,textos,fotos', 'hay filtro de qué ver (Todo, Textos, Fotos; Audios solo si hay)');
  await p.click('#filtros-tipo [data-tipo="fotos"]');
  await p.waitForTimeout(300);
  ok((await p.$$('.eliminado')).length === 1 && (await p.$$('.eliminado .foto-boton')).length === 1, 'el filtro "Fotos" deja solo la foto');
  await p.click('#filtros [data-valor="mios"]');
  await p.waitForTimeout(300);
  ok((await p.textContent('#lista')).includes('con ese filtro'), 'los dos filtros juntos (Fotos + Míos): avisa que no hay nada');
  await p.click('#filtros [data-valor="todos"]');
  await p.click('#filtros-tipo [data-tipo="textos"]');
  await p.waitForTimeout(300);
  ok((await p.$$('.eliminado')).length === 2 && (await p.$$('.eliminado .foto-boton')).length === 0, 'el filtro "Textos" deja solo los textos');
  await p.click('#filtros-tipo [data-tipo="todo"]');
  await p.waitForTimeout(300);

  // Ver la foto en grande y descargarla
  await p.waitForFunction(() => document.querySelector('.foto-boton img')?.complete && document.querySelector('.foto-boton img').naturalWidth > 0);
  await p.click('.foto-boton');
  await p.waitForSelector('.visor', { timeout: 5000 });
  const visor = await p.evaluate(() => {
    const v = document.querySelector('.visor');
    const r = v.getBoundingClientRect();
    return { ancho: r.width, alto: r.height, img: !!v.querySelector('.lienzo img')?.src, guardar: !!v.querySelector('[data-guardar]') };
  });
  ok(visor.ancho >= p.viewportSize().width - 1 && visor.alto >= p.viewportSize().height - 1, 'tocar la foto la abre en pantalla completa');
  ok(visor.img && visor.guardar, 'en grande, con el botón para descargarla');
  await p.waitForTimeout(500); // que termine de aparecer
  await p.screenshot({ path: `${capturas}papelera-01b-foto-en-grande.png` });
  await p.keyboard.press('Escape');
  await p.waitForSelector('.visor', { state: 'detached', timeout: 5000 });
  ok(p.url().includes('/papelera'), 'al cerrar el visor sigue en la papelera');

  // Volver al chat
  await p.click('.papelera-cabecera a[href="/"]');
  await p.waitForSelector('#pantalla-chat:not([hidden]), #pantalla-pin:not([hidden])', { timeout: 8000 });
  ok(true, 'la flecha de arriba vuelve al chat');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 2) Eliminar ahora y verlo en la papelera =============== */
  console.log('2) Elimino un mensaje y queda guardado en la papelera');
  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await entrar(p, 'jampier');

  const frase = `secreto de prueba ${Date.now()}`;
  await p.fill('#entrada-mensaje', frase);
  await p.click('#boton-principal');
  await p.waitForFunction((t) => document.querySelector('#mensajes').textContent.includes(t), frase, { timeout: 8000 });
  await p.waitForTimeout(1500);

  // Menú del mensaje → Eliminar para los dos
  const fila = p.locator('#mensajes .fila.mia').last();
  await fila.locator('.burbuja').click({ button: 'right' });
  await p.waitForSelector('.hoja [data-accion="borrar"]');
  await p.click('.hoja [data-accion="borrar"]');
  await p.waitForSelector('.dialogo');
  ok((await p.textContent('.dialogo')).includes('Papelera'), 'al eliminar avisa que queda guardado en la Papelera');
  await p.screenshot({ path: `${capturas}papelera-02-aviso-al-eliminar.png` });
  await p.click('.dialogo [data-respuesta="si"]');
  await p.waitForFunction((t) => !document.querySelector('#mensajes').textContent.includes(t), frase, { timeout: 8000 });
  ok(true, 'el mensaje desaparece del chat');

  // Que lo eliminado AHORA quede guardado con su texto se prueba contra la
  // base de datos real en prueba_sql.mjs (sección 19): la vista previa no
  // guarda nada, así que al cambiar de página vuelve a los ejemplos.
  await abrirPapelera(p, { porMenu: true });
  ok(await p.isVisible('#estado-lista'), 'después de eliminar, la papelera sigue abriendo bien');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 3) Es de los dos: Estrellita ve lo mismo =============== */
  console.log('3) La papelera es de los dos');
  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await entrar(p, 'estrellita');
  await abrirPapelera(p, { porMenu: true });
  const suTexto = await p.textContent('#lista');
  ok(suTexto.includes('Mejor te lo digo en persona'), 'Estrellita ve lo que eliminó Jampier');
  ok(suTexto.includes('eso no era para ti'), 'y también lo que eliminó ella');
  ok((await p.textContent('#lista')).includes('Tú'), 'los suyos salen como "Tú"');
  await p.screenshot({ path: `${capturas}papelera-03-la-ve-ella.png`, fullPage: true });

  // El aviso de que es de los dos
  ok((await p.textContent('.papelera-nota')).includes('Los dos ven lo mismo'), 'la página dice claro que los dos ven lo mismo');
  // Y en Ajustes también está contado
  await p.goto(web.url, { waitUntil: 'networkidle' });
  await p.waitForSelector('#pantalla-chat:not([hidden]), #pantalla-pin:not([hidden])');
  if (await p.isVisible('#pantalla-pin')) {
    for (const d of '1234') await p.click(`#teclado [data-digito="${d}"]`);
    await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
  }
  await p.click('#boton-menu');
  await p.click('.hoja [data-accion="ajustes"]');
  await p.waitForSelector('.panel');
  ok((await p.textContent('.panel')).includes('los dos pueden verlo'), 'en Ajustes se avisa que la papelera es de los dos');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 4) Sin sesión no se ve nada =============== */
  console.log('4) Sin sesión la papelera no muestra nada');
  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await p.goto(`${web.url}papelera/`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#estado-sin-sesion:not([hidden])', { timeout: 10000 });
  ok(await p.isVisible('#estado-sin-sesion'), 'sin sesión pide entrar primero al chat');
  ok((await p.$$('.eliminado')).length === 0, 'y no muestra ningún mensaje');
  ok(await p.isHidden('#estado-lista'), 'la lista queda escondida');
  await p.screenshot({ path: `${capturas}papelera-04-sin-sesion.png` });

  // Escrita a mano, sin la barra final: tiene que verse igual (con sus estilos)
  await p.goto(`${web.url}papelera`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#estado-sin-sesion:not([hidden])', { timeout: 10000 });
  const conEstilos = await p.evaluate(() => {
    const cab = document.querySelector('.papelera-cabecera');
    return cab && getComputedStyle(cab).position === 'sticky' && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)';
  });
  ok(conEstilos, 'escribiendo /papelera (sin barra final) la página carga con sus estilos');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 5) El PIN protege la página =============== */
  console.log('5) El PIN protege la papelera');
  contexto = await nuevoContexto(navegador);
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await entrar(p, 'jampier');
  await p.goto(`${web.url}papelera/`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#estado-pin:not([hidden])', { timeout: 10000 });
  ok(true, 'al abrir /papelera directo pide el PIN');
  ok((await p.$$('.eliminado')).length === 0, 'antes del PIN no se ve ningún mensaje');
  await p.fill('#campo-pin', '9999');
  await p.waitForTimeout(600);
  ok((await p.textContent('#error-pin')).length > 0, 'con el PIN equivocado avisa y no abre');
  ok(await p.isHidden('#estado-lista'), 'y la lista sigue escondida');
  await p.screenshot({ path: `${capturas}papelera-05-pin.png` });
  await p.fill('#campo-pin', '1234');
  await p.waitForSelector('#estado-lista:not([hidden])', { timeout: 10000 });
  ok(true, 'con el PIN correcto se abre');
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();

  /* =============== 6) En el computador también =============== */
  console.log('6) En el computador');
  contexto = await nuevoContexto(navegador, { escritorio: true, oscuro: true });
  p = await contexto.newPage();
  errores = vigilarConsola(p);
  await entrar(p, 'jampier');
  await abrirPapelera(p, { porMenu: true });
  ok(await p.isVisible('#estado-lista'), 'computador: la papelera se ve');
  const seSale = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!seSale, 'computador: nada se sale a los lados');
  await p.waitForFunction(() => document.querySelector('.foto-boton img')?.naturalWidth > 0);
  await p.click('.foto-boton');
  await p.waitForSelector('.visor');
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('.visor [data-guardar]')]);
  ok(
    descarga && /^Foto_eliminada_Messenger_Estrellita_y_Jampier_.*\.webp$/.test(descarga.suggestedFilename()),
    `computador: con clic la foto se abre en grande y el botón la descarga (${descarga?.suggestedFilename() || 'no descargó'})`,
  );
  await p.screenshot({ path: `${capturas}papelera-06b-computador-foto.png` });
  await p.keyboard.press('Escape');
  await p.screenshot({ path: `${capturas}papelera-06-computador-oscuro.png`, fullPage: true });
  ok(errores.length === 0, `sin errores en la consola ${errores.length ? JSON.stringify(errores) : ''}`);
  await contexto.close();
} finally {
  await navegador.close();
  web.cerrar?.();
}

terminar('PAPELERA');
