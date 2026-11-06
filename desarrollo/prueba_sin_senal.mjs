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
//  Uso (desde desarrollo/, con npm install hecho):
//    node servidor_cloudflare.mjs ../web 8771      ← en otra terminal
//    node prueba_sin_senal.mjs http://127.0.0.1:8771/
// ============================================================================
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:8771/';
const navegador = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
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
let bien = false;
try {
  await pagina.reload({ waitUntil: 'load', timeout: 15000 });
  const pantallas = await pagina.evaluate(() =>
    [...document.querySelectorAll('section.pantalla')].filter((s) => !s.hidden).map((s) => s.id),
  );
  bien = pantallas.length > 0;
  console.log(`  ${bien ? '✓' : '✗'} sin señal abre la app (pantallas: ${pantallas.join(', ') || 'ninguna'})`);
} catch (error) {
  console.log(`  ✗ sin señal NO abre la app: ${String(error.message).split('\n')[0]}`);
}
if (errores.length) console.log('  errores:', errores.slice(0, 3));
await navegador.close();
console.log(bien && !errores.length ? 'SIN SEÑAL: TODO OK' : 'SIN SEÑAL: FALLÓ');
process.exit(bien && !errores.length ? 0 : 1);
