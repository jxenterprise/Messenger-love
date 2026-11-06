// Abre el generador de claves como lo haría JX (doble clic → file://) y valida las claves.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const webpush = require('web-push');
const { chromium } = require('playwright');

import { mkdirSync } from 'node:fs';
const [, , archivo, carpeta = 'capturas'] = process.argv;
mkdirSync(carpeta, { recursive: true });
const nav = await chromium.launch();
const errores = [];
for (const esquema of ['light', 'dark']) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, colorScheme: esquema, deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errores.push(String(e)));
  pag.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
  await pag.goto(`file://${archivo}`);
  await pag.click('#generar');
  await pag.waitForSelector('#resultado:not([hidden])');
  await pag.fill('#correo', 'jx@ejemplo.com');
  const publica = await pag.textContent('#publica');
  const privada = await pag.textContent('#privada');
  const bloque = await pag.textContent('#bloque-supabase');
  const linea = await pag.textContent('#linea-config');
  await pag.click('[data-copiar="bloque-supabase"]');
  const copiado = await pag.evaluate(() => navigator.clipboard.readText()).catch(() => '(sin acceso)');
  await pag.screenshot({ path: `${carpeta}/generador-${esquema}.png`, fullPage: true });
  // web-push valida longitudes y formato al configurar VAPID
  let valida = true;
  try {
    webpush.setVapidDetails('mailto:jx@ejemplo.com', publica, privada);
  } catch (e) {
    valida = false;
    errores.push(`claves inválidas: ${e.message}`);
  }
  console.log(`[${esquema}] pública ${publica.length} car. (${Buffer.from(publica, 'base64url').length} bytes), privada ${Buffer.from(privada, 'base64url').length} bytes, web-push las acepta: ${valida}`);
  console.log(`[${esquema}] bloque Supabase OK: ${bloque.includes(`VAPID_PUBLIC_KEY=${publica}`) && bloque.includes(`VAPID_PRIVATE_KEY=${privada}`) && bloque.includes('VAPID_SUBJECT=mailto:jx@ejemplo.com')} · copiado igual: ${copiado === bloque} · línea config: ${linea}`);
  await ctx.close();
}
await nav.close();
console.log(errores.length ? `ERRORES: ${errores.join(' | ')}` : 'GENERADOR SIN ERRORES');
