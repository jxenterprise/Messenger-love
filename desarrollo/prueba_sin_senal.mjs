// ============================================================================
//  Prueba: la app instalada abre SIN SEÑAL en un servidor como Cloudflare Pages
// ----------------------------------------------------------------------------
//  Cloudflare redirige /index.html → / ("pretty URLs"). Si el service worker
//  guarda esa respuesta redirigida y la usa para abrir la app, el navegador la
//  rechaza (net::ERR_FAILED) y la app no abre sin internet. Esta prueba:
//    1. abre la app (se instala el service worker),
//    2. corta el internet,
//    3. recarga: la app debe abrir desde lo guardado.
//
//  Uso (desde desarrollo/): node prueba_sin_senal.mjs   (o: npm run prueba:sin-senal)
//  Con una dirección, prueba esa en vez del servidor local:
//    node prueba_sin_senal.mjs https://messenger-estrellita-jampier-18.pages.dev/?demo
// ============================================================================
import { abrirNavegador, crearRevisor, levantarWeb, pantallasVisibles } from './apoyo_navegador.mjs';

const { ok, terminar } = crearRevisor();
const web = process.argv[2] ? null : await levantarWeb();
const url = process.argv[2] || web.url;
const navegador = await abrirNavegador();

try {
  const contexto = await navegador.newContext();
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(String(e)));

  await pagina.goto(url, { waitUntil: 'networkidle' });
  // Esperar a que el service worker esté activo y controlando la página
  await pagina.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  await pagina.waitForTimeout(800);

  await contexto.setOffline(true);
  try {
    await pagina.reload({ waitUntil: 'load', timeout: 15000 });
    const pantallas = await pantallasVisibles(pagina);
    ok(pantallas.length > 0, `sin señal abre la app (pantallas: ${pantallas.join(', ') || 'ninguna'})`);
  } catch (error) {
    ok(false, `sin señal abre la app: ${String(error.message).split('\n')[0]}`);
  }
  ok(errores.length === 0, `sin errores ${errores.length ? JSON.stringify(errores.slice(0, 3)) : ''}`);
} finally {
  await navegador.close();
  web?.cerrar();
}
terminar('SIN SEÑAL');
