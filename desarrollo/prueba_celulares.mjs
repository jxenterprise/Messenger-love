// ============================================================================
//  Prueba prioritaria: los 2 celulares de la pareja
// ----------------------------------------------------------------------------
//  · iPhone 12 Pro Max (Estrellita): 428 × 926 puntos, ×3, notch arriba (47)
//    y barra de inicio abajo (34). Se prueba con el motor de Safari (WebKit).
//  · Redmi Note 14 Pro+ (Jampier): pantalla 1220 × 2712; en Chrome ≈ 407 × 904
//    puntos (cambia con "Tamaño de pantalla" de Xiaomi: se prueba también la
//    variante ancha). Motor de Chrome.
//  En cada uno recorre todas las pantallas y revisa que nada se salga a los
//  lados, que nada importante quede debajo del notch o de la barra de inicio,
//  y que no haya errores. Deja capturas en desarrollo/capturas/celulares/.
//
//  WebKit (Safari) se instala aparte una vez:  npx playwright install webkit
//  Uso (desde desarrollo/): node prueba_celulares.mjs  (o: npm run prueba:celulares)
// ============================================================================
import { chromium, webkit } from 'playwright';
import { abrirNavegador, aqui, carpetaCapturas, cerrarSorpresas, configSinSupabase, crearRevisor, levantarWeb, vigilarConsola } from './apoyo_navegador.mjs';

const CELULARES = [
  { nombre: 'iPhone 12 Pro Max · app instalada', motor: 'webkit', ancho: 428, alto: 926, escala: 3, notch: 47, barraInicio: 34 },
  { nombre: 'iPhone 12 Pro Max · Safari con barras', motor: 'webkit', ancho: 428, alto: 746, escala: 3, notch: 0, barraInicio: 0 },
  { nombre: 'Redmi Note 14 Pro+ · app instalada', motor: 'chromium', ancho: 407, alto: 904, escala: 3, notch: 0, barraInicio: 0 },
  { nombre: 'Redmi Note 14 Pro+ · Chrome con barras', motor: 'chromium', ancho: 407, alto: 800, escala: 3, notch: 0, barraInicio: 0 },
  { nombre: 'Redmi Note 14 Pro+ · pantalla ampliada', motor: 'chromium', ancho: 443, alto: 986, escala: 2.75, notch: 0, barraInicio: 0 },
];

const { ok, terminar } = crearRevisor();
const capturas = carpetaCapturas('capturas/celulares');
const web = await levantarWeb();
const foto = aqui('../web/img/demo/atardecer.webp');

let navWebkit = null;
try {
  navWebkit = await webkit.launch();
} catch {
  console.log('  (WebKit no está instalado: el iPhone se prueba con el motor de Chrome. Instálalo con: npx playwright install webkit)');
}
const navChromium = await abrirNavegador(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);

/** Revisa desbordes a los lados y que los elementos queden fuera del notch y de la barra de inicio. */
async function revisar(p, c, pantalla, { arriba = [], abajo = [], visibles = [] } = {}) {
  // Que terminen las animaciones (hojas que suben, paneles…): si se mide a
  // media animación, un elemento parece estar más abajo de donde queda.
  // Las animaciones sin fin (lluvia de corazones, destellos) no cuentan.
  await p
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity),
      null,
      { timeout: 4000 },
    )
    .catch(() => {});
  const r = await p.evaluate(
    ({ arriba, abajo, visibles, notch, barraInicio }) => {
      const ancho = document.documentElement.clientWidth;
      const alto = window.innerHeight;
      const problemas = [];
      if (document.documentElement.scrollWidth > ancho + 1) problemas.push('barra horizontal');
      const caja = (sel) => document.querySelector(sel)?.getBoundingClientRect();
      for (const sel of [...arriba, ...abajo, ...visibles]) {
        const b = caja(sel);
        if (!b || !b.width) problemas.push(`${sel} no se ve`);
        else if (b.left < -1 || b.right > ancho + 1) problemas.push(`${sel} se sale a los lados`);
      }
      for (const sel of arriba) {
        const b = caja(sel);
        if (b && b.top < notch - 1) problemas.push(`${sel} queda debajo del notch (${Math.round(b.top)} < ${notch})`);
      }
      for (const sel of abajo) {
        const b = caja(sel);
        if (b && b.bottom > alto - barraInicio + 1) problemas.push(`${sel} queda sobre la barra de inicio (${Math.round(b.bottom)} > ${alto - barraInicio})`);
      }
      return problemas;
    },
    { arriba, abajo, visibles, notch: c.notch, barraInicio: c.barraInicio },
  );
  ok(!r.length, `${c.nombre} · ${pantalla}${r.length ? ` → ${r.join('; ')}` : ''}`);
  await p.screenshot({ path: `${capturas}${`${c.nombre}-${pantalla}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png` });
}

/** El notch y la barra de inicio del iPhone (en el computador valen 0). */
async function simularZonasSeguras(p, c) {
  if (!c.notch && !c.barraInicio) return;
  await p.addStyleTag({ content: `:root:root { --seguro-arriba: ${c.notch}px !important; --seguro-abajo: ${c.barraInicio}px !important; }` });
}

try {
  for (const c of CELULARES) {
    console.log(`\n${c.nombre} (${c.ancho}×${c.alto})`);
    const nav = c.motor === 'webkit' && navWebkit ? navWebkit : navChromium;
    const opciones = { viewport: { width: c.ancho, height: c.alto }, deviceScaleFactor: c.escala, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota' };
    let contexto;
    try {
      contexto = await nav.newContext({ ...opciones, isMobile: true });
    } catch {
      contexto = await nav.newContext(opciones); // WebKit en Windows no acepta isMobile
    }
    await contexto.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: configSinSupabase() }));
    const p = await contexto.newPage();
    // "interactive-widget" es para Chrome en Android (el teclado no tapa la barra de
    // escribir); Safari solo avisa que lo ignora: no es un error.
    const errores = vigilarConsola(p, [/Failed to load resource/i, /interactive-widget/i]);
    // El "Te extraño" sorpresa de la vista previa: se revisa cómo se ve y se cierra
    let sorpresaVista = false;
    await cerrarSorpresas(p, async () => {
      if (sorpresaVista) return;
      sorpresaVista = true;
      await p.waitForTimeout(700);
      await revisar(p, c, 'te extrano recibido', { visibles: ['.capa-te-extrano [data-responder]', '.capa-te-extrano [data-cerrar]'] });
    });

    await p.goto(web.url, { waitUntil: 'networkidle' });
    await simularZonasSeguras(p, c);
    await p.waitForSelector('#pantalla-entrada:not([hidden])');
    await revisar(p, c, '1 quien eres', { visibles: ['[data-persona="jampier"]', '[data-persona="estrellita"]'] });
    await p.click('[data-persona="estrellita"]');
    await revisar(p, c, '2 pin de entrada', { visibles: ['#pin-entrada', '#boton-entrar'] });
    await p.fill('#pin-entrada', '1234');
    await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 10000 });
    await p.waitForTimeout(1800);
    await revisar(p, c, '3 chat', { arriba: ['#boton-persona', '#boton-menu'], abajo: ['#boton-principal', '#entrada-mensaje'] });

    await p.fill('#entrada-mensaje', 'Hola mi amor ❤️ ¿cómo vas?');
    await revisar(p, c, '4 escribiendo', { abajo: ['#boton-principal'] });
    await p.click('#boton-principal');
    await p.waitForTimeout(600);

    await p.click('#boton-emojis');
    await p.waitForTimeout(300);
    await revisar(p, c, '5 emojis', { abajo: ['#boton-principal'] });
    await p.click('#boton-emojis');

    await p.setInputFiles('#selector-fotos', foto);
    await p.waitForSelector('.previa-fotos');
    await revisar(p, c, '6 enviar foto', { arriba: ['.previa-fotos [data-cerrar]'], abajo: ['.previa-fotos [data-enviar]'] });
    await p.click('.previa-fotos [data-cerrar]');
    await p.waitForTimeout(300);

    await p.click('#boton-menu');
    await p.waitForSelector('.hoja');
    await p.waitForTimeout(300);
    await revisar(p, c, '7 menu', { abajo: ['.hoja [data-accion="ajustes"]'] });
    await p.click('.hoja [data-accion="ajustes"]');
    await p.waitForSelector('.panel');
    await p.waitForTimeout(350);
    await revisar(p, c, '8 ajustes', { arriba: ['.panel [data-cerrar]'] });
    await p.click('.panel [data-accion="cambiar-pin"]');
    await p.waitForSelector('#pin-actual');
    await revisar(p, c, '9 cambiar pin', { visibles: ['.dialogo [type="submit"]'] });
    await p.click('.dialogo [data-cerrar]');
    await p.waitForTimeout(250);
    await p.click('.panel [data-cerrar]');
    await p.waitForTimeout(300);

    await p.click('#boton-menu');
    await p.click('.hoja [data-accion="buscar"]');
    await p.waitForSelector('#texto-busqueda');
    await p.fill('#texto-busqueda', 'amor');
    await p.waitForTimeout(800);
    await revisar(p, c, '10 buscar', { arriba: ['#texto-busqueda'] });
    await p.click('.panel [data-cerrar]');
    await p.waitForTimeout(300);

    await p.click('#boton-te-extrano');
    await p.waitForTimeout(900);
    await revisar(p, c, '11 te extrano enviado', { abajo: ['#boton-principal'] });

    await p.click('#boton-tema');
    await p.waitForTimeout(500);
    await revisar(p, c, '12 modo oscuro', { arriba: ['#boton-menu'], abajo: ['#boton-principal'] });
    await p.click('#boton-tema');

    await p.click('#boton-menu');
    await p.click('.hoja [data-accion="bloquear"]');
    await p.waitForSelector('#pantalla-pin:not([hidden])');
    await revisar(p, c, '13 bloqueo', { visibles: ['#teclado [data-digito="1"]', '#teclado [data-borrar]'], abajo: ['#olvide-pin'] });

    ok(errores.length === 0, `${c.nombre} · sin errores en la consola ${errores.length ? JSON.stringify(errores.slice(0, 2)) : ''}`);
    await contexto.close();
  }
} finally {
  await navChromium.close();
  await navWebkit?.close();
  web.cerrar();
}
terminar('LOS 2 CELULARES (REDMI NOTE 14 PRO+ Y IPHONE 12 PRO MAX)');
