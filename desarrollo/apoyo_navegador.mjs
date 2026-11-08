// ============================================================================
//  Apoyo para las pruebas en el navegador (Node + Playwright)
// ----------------------------------------------------------------------------
//  · Levanta la carpeta web/ con el servidor que imita a Cloudflare Pages.
//  · Abre el navegador: Microsoft Edge (viene con Windows), o Chrome si
//    defines CHROME=ruta, o el Chromium de Playwright como último recurso.
//  · Lleva la cuenta de las pruebas y de los errores de la consola.
// ============================================================================
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const aqui = (ruta) => fileURLToPath(new URL(ruta, import.meta.url));

/** Servidor de la carpeta web/ en un puerto libre. Devuelve { url, puerto, cerrar }. */
export async function levantarWeb(puerto = 8800 + Math.floor(Math.random() * 800)) {
  const proceso = spawn(process.execPath, [aqui('./servidor_cloudflare.mjs'), aqui('../web'), String(puerto)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolver, rechazar) => {
    proceso.stdout.on('data', (d) => String(d).includes('Cloudflare simulado') && resolver());
    proceso.on('exit', (codigo) => rechazar(new Error(`El servidor se cerró (${codigo})`)));
  });
  return { url: `http://127.0.0.1:${puerto}/`, puerto, cerrar: () => proceso.kill() };
}

/** Abre el navegador (Edge → Chrome de CHROME → Chromium de Playwright). */
export async function abrirNavegador(argumentos = []) {
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', ...argumentos];
  if (process.env.CHROME) return chromium.launch({ executablePath: process.env.CHROME, args });
  try {
    return await chromium.launch({ channel: 'msedge', args });
  } catch {
    return chromium.launch({ args });
  }
}

/**
 * config.js SIN los datos de Supabase. Las pruebas nunca tocan el proyecto
 * real: usan el modo demo o un Supabase imitado.
 */
export function configSinSupabase() {
  return readFileSync(aqui('../web/js/config.js'), 'utf8')
    .replace(/SUPABASE_URL: '[^']*'/, "SUPABASE_URL: ''")
    .replace(/SUPABASE_KEY: '[^']*'/, "SUPABASE_KEY: ''");
}

/** Contexto de celular (o de computador con escritorio: true), siempre sin el Supabase real. */
export async function nuevoContexto(navegador, { escritorio = false, oscuro = false } = {}) {
  const contexto = await crearContexto(navegador, { escritorio, oscuro });
  await contexto.route('**/js/config.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: configSinSupabase() }));
  return contexto;
}

function crearContexto(navegador, { escritorio, oscuro }) {
  return navegador.newContext(
    escritorio
      ? { viewport: { width: 1280, height: 800 }, colorScheme: oscuro ? 'dark' : 'light', locale: 'es-CO', timezoneId: 'America/Bogota' }
      : {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          colorScheme: oscuro ? 'dark' : 'light',
          locale: 'es-CO',
          timezoneId: 'America/Bogota',
        },
  );
}

/** Contador de pruebas compartido. */
export function crearRevisor() {
  const fallos = [];
  let total = 0;
  const ok = (condicion, texto) => {
    total += 1;
    console.log(`${condicion ? '  ✓ ' : '  ✗ '}${texto}`);
    if (!condicion) fallos.push(texto);
  };
  const terminar = (nombre) => {
    console.log(`\n${total - fallos.length}/${total} pruebas superadas`);
    if (fallos.length) {
      console.log(`FALLARON:\n - ${fallos.join('\n - ')}`);
      process.exitCode = 1;
    } else console.log(`${nombre}: TODO OK`);
  };
  return { ok, terminar };
}

/** Guarda los errores de la consola de una página (ignorando los esperados). */
export function vigilarConsola(pagina, ignorar = []) {
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(`[pageerror] ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    if (!ignorar.some((patron) => patron.test(texto))) errores.push(texto);
  });
  return errores;
}

export function carpetaCapturas(nombre = 'capturas') {
  const ruta = aqui(`./${nombre}/`);
  mkdirSync(ruta, { recursive: true });
  return ruta;
}

/**
 * En la vista previa la "pareja de ejemplo" manda un "Te extraño" sorpresa a
 * los ~26 s, con una pantalla especial que tapa todo (a propósito). Si aparece
 * en medio de una prueba, se cierra como lo haría una persona.
 * @param {(capa: import('playwright').Locator) => Promise<void>} [antesDeCerrar]
 */
export async function cerrarSorpresas(pagina, antesDeCerrar) {
  await pagina.addLocatorHandler(pagina.locator('.capa-te-extrano'), async (capa) => {
    await antesDeCerrar?.(capa);
    await capa.locator('[data-cerrar]').click();
  });
}

/** Pantallas visibles ahora mismo. */
export const pantallasVisibles = (pagina) =>
  pagina.evaluate(() => [...document.querySelectorAll('section.pantalla')].filter((s) => !s.hidden).map((s) => s.id));
