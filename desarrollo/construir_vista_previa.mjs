// Construye la vista previa (un solo HTML con todo incrustado) a partir de la app real.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const [, , carpetaWeb, salida] = process.argv;
const leer = (r) => readFileSync(join(carpetaWeb, r));
const dataUri = (r, tipo) => `data:${tipo};base64,${leer(r).toString('base64')}`;

// 1) CSS con las fuentes incrustadas
let css = leer('css/styles.css').toString('utf8');
css = css
  .replace('url("../fonts/nunito-variable.woff2")', `url("${dataUri('fonts/nunito-variable.woff2', 'font/woff2')}")`)
  .replace('url("../fonts/nunito-variable-italica.woff2")', `url("${dataUri('fonts/nunito-variable-italica.woff2', 'font/woff2')}")`)
  .replace('url("../fonts/dancing-script-variable.woff2")', `url("${dataUri('fonts/dancing-script-variable.woff2', 'font/woff2')}")`);
if (css.includes('../fonts/')) throw new Error('Quedó una fuente sin incrustar');

// 2) JavaScript en un solo paquete
const resultado = await build({
  entryPoints: [join(carpetaWeb, 'js/app.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020', 'safari15'],
  write: false,
  external: ['./vendor/*'],
  legalComments: 'none',
  minify: true,
  // La vista previa siempre es demo: así se eliminan las partes que no aplican (p. ej. guardar fotos)
  define: { 'window.__VISTA_PREVIA__': 'true' },
});
const js = resultado.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 3) Cuerpo del HTML (sin <head>, el marco de la vista previa lo pone)
const html = leer('index.html').toString('utf8');
let cuerpo = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const logo = dataUri('img/favicon.svg', 'image/svg+xml');
cuerpo = cuerpo.replaceAll('src="img/favicon.svg"', `src="${logo}"`);

const activos = {
  foto: dataUri('img/demo/atardecer.webp', 'image/webp'),
  audio: dataUri('img/demo/nota-de-voz.m4a', 'audio/mp4'),
};

const temaInicial = leer('js/tema-inicial.js').toString('utf8');

const pagina = `<title>Messenger Estrellita y Jampier</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="robots" content="noindex, nofollow">
<style>${css}</style>
${cuerpo}
<script>window.__VISTA_PREVIA__ = true; window.__ACTIVOS_DEMO__ = ${JSON.stringify(activos)};</script>
<script>${temaInicial}</script>
<script>${js}</script>
`;

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, pagina);
console.log('✓ vista previa:', salida, `${(pagina.length / 1024).toFixed(0)} KB`);
