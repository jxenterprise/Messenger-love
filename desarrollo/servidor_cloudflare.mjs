// ============================================================================
//  Servidor de pruebas que imita lo importante de Cloudflare Pages
// ----------------------------------------------------------------------------
//   · /index.html (y /carpeta/index.html) → 308 a la carpeta ("pretty URLs")
//   · /algo.html → 308 a /algo, y /algo sirve algo.html
//   · rutas que no existen → 404.html con estado 404
//  Sirve para probar la app como queda publicada (python -m http.server no
//  hace esas redirecciones y por eso no detecta ciertos problemas).
//  Uso: node servidor_cloudflare.mjs ../web 8771
// ============================================================================
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [, , carpeta, puerto] = process.argv;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.m4a': 'audio/mp4',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

async function existe(ruta) {
  try {
    return (await stat(ruta)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/index.html')) {
    res.writeHead(308, { Location: ruta.slice(0, -'index.html'.length) + url.search });
    return res.end();
  }
  if (ruta.endsWith('.html')) {
    res.writeHead(308, { Location: ruta.slice(0, -5) + url.search });
    return res.end();
  }
  let archivo = normalize(join(carpeta, ruta));
  if (ruta.endsWith('/')) archivo = join(archivo, 'index.html');
  else if (!extname(ruta) && (await existe(`${archivo}.html`))) archivo = `${archivo}.html`;
  if (!(await existe(archivo))) {
    res.writeHead(404, { 'Content-Type': TIPOS['.html'] });
    return res.end(await readFile(join(carpeta, '404.html')).catch(() => ''));
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(archivo));
}).listen(Number(puerto), '127.0.0.1', () => console.log(`Cloudflare simulado en http://127.0.0.1:${puerto}/ (${carpeta})`));
