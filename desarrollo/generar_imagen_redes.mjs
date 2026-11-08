// ============================================================================
//  Generador de la imagen para compartir (Open Graph) — Messenger E ❤ J
// ----------------------------------------------------------------------------
//  Es la imagen que sale al compartir el enlace en WhatsApp, Telegram,
//  Facebook, Messenger, Instagram, X, iMessage, Discord…
//
//  · Toma la foto especial de web/img/Justos/Estrellita_y_Jampier.webp
//    (vertical) y arma una imagen horizontal de 1200 × 630 (la medida que
//    piden las redes): la foto COMPLETA en el centro, sin recortar, sobre un
//    fondo hecho con la misma foto difuminada + los corazones de la app.
//    Así también se ve bien cuando WhatsApp o Telegram la recortan en
//    cuadrado (la foto queda dentro del cuadrado del centro).
//  · Guarda web/img/Justos/Estrellita_y_Jampier_redes.jpg (JPEG: es el único
//    formato que TODAS las redes muestran; ver el README) por debajo de
//    MAX_KB para que WhatsApp no la descarte.
//
//  Uso (desde desarrollo/):
//    npm run imagen:redes
//    npm run imagen:redes -- --original "C:\ruta\foto.png"   ← cambiar la foto
//  Con --original, primero convierte esa foto a WebP y la guarda como
//  web/img/Justos/Estrellita_y_Jampier.webp; después arma la imagen.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { abrirNavegador, aqui } from './apoyo_navegador.mjs';

const CARPETA = aqui('../web/img/Justos/');
const FOTO = `${CARPETA}Estrellita_y_Jampier.webp`;
const SALIDA = `${CARPETA}Estrellita_y_Jampier_redes.jpg`;
const ANCHO = 1200;
const ALTO = 630;
const MAX_KB = 250; // ✏️ WhatsApp no muestra imágenes pesadas: se deja con margen

const i = process.argv.indexOf('--original');
const original = i > -1 ? process.argv[i + 1] : null;

const tipoDe = (ruta) => (/\.png$/i.test(ruta) ? 'image/png' : /\.jpe?g$/i.test(ruta) ? 'image/jpeg' : 'image/webp');
const comoDataUrl = (ruta) => `data:${tipoDe(ruta)};base64,${readFileSync(ruta).toString('base64')}`;
const kb = (n) => `${Math.round(n / 1024)} KB`;

// Corazones y estrellitas: el mismo dibujo del fondo de la app (css/styles.css → .patron)
const PATRON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><g fill='black'><path transform='translate(18 22) rotate(-14) scale(1.1)' d='M6 10.6C5.5 10.2 1 7.4 1 4.4 1 2.5 2.5 1 4.2 1c.8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1C9.5 1 11 2.5 11 4.4c0 3-4.5 5.8-5 6.2z'/><path transform='translate(120 14) scale(.8)' d='M6 0c.5 3.2 1.8 4.5 6 6-4.2 1.5-5.5 2.8-6 6-.5-3.2-1.8-4.5-6-6 4.2-1.5 5.5-2.8 6-6z'/><path transform='translate(160 64) rotate(16) scale(1.3)' d='M6 10.6C5.5 10.2 1 7.4 1 4.4 1 2.5 2.5 1 4.2 1c.8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1C9.5 1 11 2.5 11 4.4c0 3-4.5 5.8-5 6.2z'/><path transform='translate(70 78) scale(1.05)' d='M6 0c.5 3.2 1.8 4.5 6 6-4.2 1.5-5.5 2.8-6 6-.5-3.2-1.8-4.5-6-6 4.2-1.5 5.5-2.8 6-6z'/><path transform='translate(24 122) rotate(10) scale(.85)' d='M6 10.6C5.5 10.2 1 7.4 1 4.4 1 2.5 2.5 1 4.2 1c.8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1C9.5 1 11 2.5 11 4.4c0 3-4.5 5.8-5 6.2z'/><path transform='translate(108 132) rotate(-20) scale(1.2)' d='M6 10.6C5.5 10.2 1 7.4 1 4.4 1 2.5 2.5 1 4.2 1c.8 0 1.4.4 1.8 1 .4-.6 1-1 1.8-1C9.5 1 11 2.5 11 4.4c0 3-4.5 5.8-5 6.2z'/><path transform='translate(168 150) scale(.7)' d='M6 0c.5 3.2 1.8 4.5 6 6-4.2 1.5-5.5 2.8-6 6-.5-3.2-1.8-4.5-6-6 4.2-1.5 5.5-2.8 6-6z'/><path transform='translate(56 176) scale(.6)' d='M6 0c.5 3.2 1.8 4.5 6 6-4.2 1.5-5.5 2.8-6 6-.5-3.2-1.8-4.5-6-6 4.2-1.5 5.5-2.8 6-6z'/><circle cx='96' cy='40' r='1.6'/><circle cx='148' cy='108' r='1.4'/><circle cx='40' cy='70' r='1.2'/><circle cx='140' cy='186' r='1.6'/><circle cx='186' cy='22' r='1.2'/></g></svg>";

const navegador = await abrirNavegador();
try {
  mkdirSync(CARPETA, { recursive: true });
  const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });

  // 1) Foto nueva → WebP (formato de las imágenes del proyecto)
  if (original) {
    if (!existsSync(original)) throw new Error(`No encontré la foto: ${original}`);
    const webp = await pagina.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const lienzo = document.createElement('canvas');
      lienzo.width = img.naturalWidth;
      lienzo.height = img.naturalHeight;
      lienzo.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binario = '';
      for (let j = 0; j < bytes.length; j += 0x8000) binario += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
      return { base64: btoa(binario), ancho: img.naturalWidth, alto: img.naturalHeight };
    }, comoDataUrl(original));
    writeFileSync(FOTO, Buffer.from(webp.base64, 'base64'));
    console.log(`Foto guardada en WebP: ${webp.ancho} × ${webp.alto}, ${kb(Buffer.from(webp.base64, 'base64').length)}`);
  }
  if (!existsSync(FOTO)) throw new Error('Falta web/img/Justos/Estrellita_y_Jampier.webp (usa --original "ruta de la foto").');

  // 2) La composición de 1200 × 630
  const foto = comoDataUrl(FOTO);
  await pagina.setContent(`<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; background: #2F2238; }
  .fondo { position: absolute; inset: -80px; background: url("${foto}") center / cover; filter: blur(38px) saturate(1.2) brightness(0.72); }
  .velo { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(121, 82, 184, 0.5), rgba(47, 34, 56, 0.25) 50%, rgba(224, 96, 122, 0.4)); }
  .patron { position: absolute; inset: 0; background: rgba(255, 255, 255, 0.2);
    -webkit-mask-image: url("${PATRON}"); mask-image: url("${PATRON}"); -webkit-mask-size: 200px 200px; mask-size: 200px 200px; }
  .foto { position: absolute; top: 24px; left: 50%; height: ${ALTO - 48}px; transform: translateX(-50%);
    border-radius: 26px; box-shadow: 0 0 0 6px rgba(255, 253, 251, 0.92), 0 22px 60px rgba(20, 8, 28, 0.55); }
</style></head>
<body><div class="fondo"></div><div class="velo"></div><div class="patron"></div><img class="foto" src="${foto}" alt=""></body></html>`);
  await pagina.evaluate(() => document.querySelector('.foto').decode());

  // 3) JPEG lo más nítido posible sin pasar de MAX_KB
  let calidad = 90;
  let jpg = await pagina.screenshot({ type: 'jpeg', quality: calidad });
  while (jpg.length > MAX_KB * 1024 && calidad > 60) {
    calidad -= 4;
    jpg = await pagina.screenshot({ type: 'jpeg', quality: calidad });
  }
  if (jpg.length > MAX_KB * 1024) throw new Error(`La imagen quedó de ${kb(jpg.length)} (máximo ${MAX_KB} KB).`);
  writeFileSync(SALIDA, jpg);
  console.log(`Imagen para compartir: ${ANCHO} × ${ALTO}, calidad ${calidad}, ${kb(jpg.length)} → web/img/Justos/Estrellita_y_Jampier_redes.jpg`);
} finally {
  await navegador.close();
}
