// ============================================================================
//  Prueba: la app se ve bien en todos los tamaños (Android, iPhone, tablet, PC)
// ----------------------------------------------------------------------------
//  Recorre cada pantalla (entrada, PIN, chat, ajustes, emojis, cambio de PIN,
//  bloqueo y "Casi listo") en 10 tamaños de dispositivo y revisa que:
//    · nada se salga a los lados (sin barra horizontal),
//    · los botones importantes queden dentro de la pantalla,
//    · no haya errores en la consola.
//  Deja capturas en desarrollo/capturas/pantallas/.
//
//  Uso (desde desarrollo/): node prueba_pantallas.mjs   (o: npm run prueba:pantallas)
// ============================================================================
import { abrirNavegador, carpetaCapturas, crearRevisor, levantarWeb, vigilarConsola, cerrarSorpresas } from './apoyo_navegador.mjs';
import { configSinSupabase } from './apoyo_navegador.mjs';

const DISPOSITIVOS = [
  { nombre: 'Galaxy Fold cerrado', ancho: 280, alto: 653, escala: 3, celular: true },
  { nombre: 'Android pequeño (Galaxy A)', ancho: 360, alto: 740, escala: 3, celular: true },
  { nombre: 'iPhone SE', ancho: 375, alto: 667, escala: 2, celular: true },
  { nombre: 'iPhone 15', ancho: 393, alto: 852, escala: 3, celular: true },
  { nombre: 'Pixel 7', ancho: 412, alto: 915, escala: 2.6, celular: true },
  { nombre: 'iPhone 15 Pro Max', ancho: 430, alto: 932, escala: 3, celular: true },
  { nombre: 'iPhone SE acostado', ancho: 667, alto: 375, escala: 2, celular: true },
  { nombre: 'iPad mini', ancho: 768, alto: 1024, escala: 2, celular: true },
  { nombre: 'Portátil', ancho: 1366, alto: 768, escala: 1, celular: false },
  { nombre: 'Monitor grande', ancho: 1920, alto: 1080, escala: 1, celular: false },
];

const { ok, terminar } = crearRevisor();
const capturas = carpetaCapturas('capturas/pantallas');
const web = await levantarWeb();
const navegador = await abrirNavegador(['--host-resolver-rules=MAP eyj.prueba 127.0.0.1']);

/** Elementos visibles que se salen a los lados (fuera de zonas con scroll propio). */
function revisarDesborde(pagina) {
  return pagina.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const resultado = { pagina: document.documentElement.scrollWidth > ancho + 1, elementos: [] };
    const conScrollPropio = (n) => {
      for (let p = n.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return true;
      }
      return false;
    };
    for (const n of document.querySelectorAll('body *')) {
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || s.display === 'none' || s.position === 'fixed' && s.pointerEvents === 'none') continue;
      if (n.closest('[hidden], .lluvia, .patron::before')) continue;
      if ((r.right > ancho + 1 || r.left < -1) && !conScrollPropio(n)) {
        const id = n.id ? `#${n.id}` : n.className && typeof n.className === 'string' ? `.${n.className.trim().split(/\s+/).join('.')}` : n.tagName.toLowerCase();
        resultado.elementos.push(`${id} (${Math.round(r.left)}→${Math.round(r.right)} de ${ancho})`);
      }
    }
    resultado.elementos = [...new Set(resultado.elementos)].slice(0, 5);
    return resultado;
  });
}

/** ¿El elemento está completamente dentro de la pantalla? */
const dentro = (pagina, selector) =>
  pagina.evaluate((sel) => {
    const n = document.querySelector(sel);
    if (!n) return false;
    const r = n.getBoundingClientRect();
    return r.left >= -1 && r.right <= document.documentElement.clientWidth + 1 && r.width > 0;
  }, selector);

async function revisar(pagina, d, pantalla, { botones = [] } = {}) {
  const desborde = await revisarDesborde(pagina);
  const fuera = [];
  for (const b of botones) if (!(await dentro(pagina, b))) fuera.push(b);
  const bien = !desborde.pagina && !desborde.elementos.length && !fuera.length;
  const detalle = bien ? '' : ` → ${desborde.pagina ? 'barra horizontal; ' : ''}${desborde.elementos.join(', ')}${fuera.length ? ` botones fuera: ${fuera.join(', ')}` : ''}`;
  ok(bien, `${d.nombre} · ${pantalla}${detalle}`);
  const archivo = `${d.nombre}-${pantalla}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await pagina.screenshot({ path: `${capturas}${archivo}.png` });
}

try {
  for (const d of DISPOSITIVOS) {
    console.log(`\n${d.nombre} (${d.ancho}×${d.alto})`);
    const contexto = await navegador.newContext({
      viewport: { width: d.ancho, height: d.alto },
      deviceScaleFactor: d.escala,
      isMobile: d.celular,
      hasTouch: d.celular,
      locale: 'es-CO',
      timezoneId: 'America/Bogota',
    });
    await contexto.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: configSinSupabase() }));
    const p = await contexto.newPage();
    const errores = vigilarConsola(p);
    await cerrarSorpresas(p);

    // "Casi listo" (publicada sin Supabase)
    await p.goto(`http://eyj.prueba:${web.puerto}/`, { waitUntil: 'networkidle' });
    await p.waitForSelector('#pantalla-conexion:not([hidden])');
    await revisar(p, d, 'casi listo', { botones: ['#enlace-demo'] });

    // Entrada en 2 pasos (vista previa en el computador de pruebas)
    await p.goto(web.url, { waitUntil: 'networkidle' });
    await p.waitForSelector('#pantalla-entrada:not([hidden])');
    await revisar(p, d, 'quien eres', { botones: ['[data-persona="jampier"]', '[data-persona="estrellita"]'] });
    await p.click('[data-persona="jampier"]');
    await revisar(p, d, 'pin de entrada', { botones: ['#pin-entrada', '#boton-entrar', '#cambiar-persona'] });
    await p.fill('#pin-entrada', '1234');
    await p.waitForSelector('#pantalla-chat:not([hidden])', { timeout: 8000 });
    await p.waitForTimeout(1500);
    await revisar(p, d, 'chat', { botones: ['#boton-te-extrano', '#boton-tema', '#boton-menu', '#boton-principal', '#boton-foto', '#boton-emojis'] });

    // Emojis
    await p.click('#boton-emojis');
    await p.waitForTimeout(250);
    await revisar(p, d, 'emojis');
    await p.click('#boton-emojis');

    // Ajustes y cambio de PIN
    await p.click('#boton-menu');
    await p.click('.hoja [data-accion="ajustes"]');
    await p.waitForSelector('.panel');
    await p.waitForTimeout(300);
    await revisar(p, d, 'ajustes', { botones: ['.panel [data-cerrar]'] });
    await p.click('.panel [data-accion="cambiar-pin"]');
    await p.waitForSelector('#pin-actual');
    await revisar(p, d, 'cambiar pin', { botones: ['.dialogo [type="submit"]', '.dialogo [data-cerrar]'] });
    await p.click('.dialogo [data-cerrar]');
    await p.waitForTimeout(250);
    await p.click('.panel [data-cerrar]');
    await p.waitForTimeout(300);

    // Bloqueo con PIN
    await p.click('#boton-menu');
    await p.click('.hoja [data-accion="bloquear"]');
    await p.waitForSelector('#pantalla-pin:not([hidden])');
    await revisar(p, d, 'bloqueo', { botones: ['#teclado [data-digito="1"]', '#teclado [data-digito="0"]', '#teclado [data-borrar]'] });

    ok(errores.length === 0, `${d.nombre} · sin errores en la consola ${errores.length ? JSON.stringify(errores.slice(0, 2)) : ''}`);
    await contexto.close();
  }
} finally {
  await navegador.close();
  web.cerrar();
}
terminar('PANTALLAS EN TODOS LOS DISPOSITIVOS');
