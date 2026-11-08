// ============================================================================
//  Prueba la vista previa al compartir el enlace (Open Graph) y robots.txt
// ----------------------------------------------------------------------------
//  · Las etiquetas og:* y twitter:* de web/index.html: completas, con
//    direcciones absolutas (https://…) y apuntando a una imagen que existe.
//  · La imagen: JPEG de 1200 × 630 y liviana (WhatsApp descarta las pesadas).
//  · robots.txt: los BUSCADORES siguen sin poder entrar (chat privado), pero
//    los robots que arman la vista previa (Telegram, Facebook/WhatsApp, X…)
//    sí pueden leer la portada y la imagen. Se evalúa como lo hacen los
//    robots (RFC 9309): cada robot obedece SOLO el grupo que lo nombra.
//  · Servida como en Cloudflare: la portada y la imagen responden bien a cada
//    robot (página 200 con las etiquetas, imagen 200 image/jpeg).
//
//  Uso (desde desarrollo/): node prueba_redes.mjs   (o: npm run prueba:redes)
// ============================================================================
import { readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { aqui, crearRevisor } from './apoyo_navegador.mjs';

const { ok, terminar } = crearRevisor();
const leer = (ruta) => readFileSync(aqui(ruta), 'utf8');
const MAX_KB = 300; // WhatsApp no muestra imágenes más pesadas (el generador apunta a ≤ 250 KB)

// Robots que arman vistas previas (deben poder entrar) y buscadores (no deben)
const ROBOTS_VISTA_PREVIA = ['TelegramBot', 'facebookexternalhit', 'Facebot', 'WhatsApp', 'Twitterbot', 'LinkedInBot', 'Slackbot-LinkExpanding', 'Discordbot'];
const BUSCADORES = ['Googlebot', 'Bingbot', 'DuckDuckBot', 'Yandex', 'Baiduspider', 'GPTBot', 'CCBot', 'meta-externalagent', 'cualquier-robot'];
const AGENTES = {
  TelegramBot: 'TelegramBot (like TwitterBot)',
  facebookexternalhit: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  WhatsApp: 'WhatsApp/2.24.1.6 A',
  Twitterbot: 'Twitterbot/1.0',
  Discordbot: 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
};

/* ---------- 1) Etiquetas Open Graph ---------- */
console.log('1) Etiquetas de la vista previa (Open Graph) en index.html');
const html = leer('../web/index.html');
const cabeza = html.slice(0, html.indexOf('</head>'));
const meta = {};
for (const m of cabeza.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"\s*\/?>/g)) meta[m[1]] = m[2];
const nombreProyecto = leer('../wrangler.toml').match(/^name\s*=\s*"([^"]+)"/m)[1];
const dominio = `https://${nombreProyecto}.pages.dev/`;

ok(meta['og:title']?.includes('Estrellita') && meta['og:title']?.includes('Jampier'), `og:title: "${meta['og:title']}"`);
ok(!!meta['og:description'], `og:description: "${meta['og:description']}"`);
ok(meta['og:type'] === 'website', 'og:type = website');
ok(meta['og:url'] === dominio, `og:url es la dirección publicada (${dominio}, sale del name de wrangler.toml)`);
const imagen = meta['og:image'] || '';
ok(imagen.startsWith(dominio), 'og:image es una dirección COMPLETA del mismo dominio (las redes no entienden rutas relativas)');
ok(imagen.includes('/img/Juntos/'), 'la imagen vive en la carpeta img/Juntos');
ok(meta['og:image:secure_url'] === imagen && meta['twitter:image'] === imagen, 'og:image:secure_url y twitter:image apuntan a la misma imagen');
ok(meta['twitter:card'] === 'summary_large_image', 'twitter:card = summary_large_image (imagen grande en X)');
ok(!!meta['og:image:alt'] && meta['twitter:image:alt'] === meta['og:image:alt'], 'la imagen tiene texto alternativo');
ok(/noindex/.test(meta.robots || '') && /X-Robots-Tag:[^\n]*noindex/.test(leer('../web/_headers')), 'sigue el "noindex": ningún buscador la muestra');

/* ---------- 2) La imagen ---------- */
console.log('2) La imagen para compartir');
const rutaLocal = `../web/${imagen.slice(dominio.length)}`;
let bytes = Buffer.alloc(0);
try {
  bytes = readFileSync(aqui(rutaLocal));
} catch {
  /* se reporta abajo */
}
ok(bytes.length > 0, `existe ${rutaLocal.replace('../', '')}`);
ok(bytes[0] === 0xff && bytes[1] === 0xd8, 'es JPEG de verdad (el único formato que todas las redes muestran)');
const medidas = medidasJpeg(bytes);
ok(medidas && String(medidas.ancho) === meta['og:image:width'] && String(medidas.alto) === meta['og:image:height'], `mide lo que dicen og:image:width/height (${medidas?.ancho} × ${medidas?.alto})`);
ok(medidas?.ancho === 1200 && medidas?.alto === 630, 'mide 1200 × 630 (la medida recomendada por las redes)');
ok(meta['og:image:type'] === 'image/jpeg', 'og:image:type = image/jpeg');
ok(bytes.length <= MAX_KB * 1024, `pesa ${Math.round(bytes.length / 1024)} KB (máximo ${MAX_KB} KB para WhatsApp)`);
ok(statSync(aqui('../web/img/Juntos/Estrellita_y_Jampier.webp')).size > 0, 'la foto original también está guardada (en WebP) para rehacer la imagen');
ok(/^\/img\/Justos\/\*\s+\/img\/Juntos\/:splat\s+301\s*$/m.test(leer('../web/_redirects')), 'la dirección vieja (img/Justos, v1.7) lleva a la nueva con un 301 (_redirects)');

/* ---------- 3) robots.txt ---------- */
console.log('3) robots.txt: buscadores fuera, vista previa adentro');
const reglas = leerRobots(leer('../web/robots.txt'));
for (const b of BUSCADORES) ok(!puedeEntrar(reglas, b, '/'), `${b}: NO puede entrar`);
for (const b of ROBOTS_VISTA_PREVIA) {
  ok(puedeEntrar(reglas, b, '/') && puedeEntrar(reglas, b, new URL(imagen).pathname), `${b}: puede leer la portada y la imagen`);
}

/* ---------- 4) Servida como en Cloudflare ---------- */
console.log('4) Servida como en Cloudflare: cada robot recibe la portada y la imagen');
const puerto = 8800 + Math.floor(Math.random() * 150);
const servidor = spawn(process.execPath, [aqui('./servidor_cloudflare.mjs'), aqui('../web'), String(puerto)], { stdio: ['ignore', 'pipe', 'inherit'] });
try {
  await new Promise((listo, fallo) => {
    servidor.stdout.on('data', (d) => String(d).includes('Cloudflare simulado') && listo());
    servidor.on('exit', (c) => fallo(new Error(`el servidor se cerró (${c})`)));
    setTimeout(() => fallo(new Error('el servidor no arrancó')), 8000);
  });
  const base = `http://127.0.0.1:${puerto}`;
  for (const [nombre, agente] of Object.entries(AGENTES)) {
    const portada = await fetch(`${base}/`, { headers: { 'User-Agent': agente } });
    const texto = await portada.text();
    const img = await fetch(`${base}${new URL(imagen).pathname}`, { headers: { 'User-Agent': agente } });
    const cuerpo = Buffer.from(await img.arrayBuffer());
    ok(
      portada.status === 200 && texto.includes('property="og:image"') && img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && cuerpo.length === bytes.length,
      `${nombre}: portada 200 con og:image e imagen 200 image/jpeg`,
    );
  }
} catch (error) {
  ok(false, `servir como Cloudflare: ${error.message}`);
} finally {
  servidor.kill();
}

terminar('VISTA PREVIA AL COMPARTIR');

/* ==========================================================================
   Ayudas
   ========================================================================== */
/** Ancho y alto de un JPEG (lee el marcador SOF). */
function medidasJpeg(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marca = b[i + 1];
    const largo = b.readUInt16BE(i + 2);
    if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    i += 2 + largo;
  }
  return null;
}

/** Lee robots.txt en grupos: [{ agentes: ['telegrambot'], reglas: [{ permitir, ruta }] }] */
function leerRobots(texto) {
  const grupos = [];
  let actual = null;
  let leyendoAgentes = false;
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.replace(/#.*/, '').trim();
    const m = limpia.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === 'user-agent') {
      if (!leyendoAgentes) {
        actual = { agentes: [], reglas: [] };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      leyendoAgentes = true;
    } else if ((campo === 'allow' || campo === 'disallow') && actual) {
      leyendoAgentes = false;
      if (valor) actual.reglas.push({ permitir: campo === 'allow', ruta: valor });
    } else leyendoAgentes = false;
  }
  return grupos;
}

/** ¿Puede este robot leer esta ruta? (RFC 9309: grupo que lo nombra, si no "*"; gana la regla más larga; empate → Allow) */
function puedeEntrar(grupos, robot, ruta) {
  const token = robot.toLowerCase();
  let suyos = grupos.filter((g) => g.agentes.includes(token));
  if (!suyos.length) suyos = grupos.filter((g) => g.agentes.includes('*'));
  const reglas = suyos.flatMap((g) => g.reglas);
  let mejor = null;
  for (const r of reglas) {
    const patron = new RegExp(`^${r.ruta.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$')}`);
    if (!patron.test(ruta)) continue;
    if (!mejor || r.ruta.length > mejor.ruta.length || (r.ruta.length === mejor.ruta.length && r.permitir)) mejor = r;
  }
  return mejor ? mejor.permitir : true;
}
