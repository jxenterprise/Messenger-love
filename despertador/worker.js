// ============================================================================
//  Despertador — Messenger Estrellita y Jampier ❤️
// ----------------------------------------------------------------------------
//  Supabase (plan gratis) pausa el proyecto si pasa 7 días sin actividad.
//  Si algún día dejan de escribirse una semana (un viaje juntos, por ejemplo),
//  este pequeño "Worker" de Cloudflare toca la base de datos 4 veces al día
//  para que nunca se duerma. Es gratis.
//
//  CÓMO USARLO (los pasos completos están en el README, paso 8):
//    1. Cloudflare → Workers & Pages → Create → Worker → "Hello World" → Deploy.
//    2. "Edit code" → borra todo → pega este archivo → cambia las 2 líneas
//       de abajo → Deploy.
//    3. Settings → Triggers → Cron Triggers → Add → "0 */6 * * *" → Add.
//    4. Para probarlo, abre la dirección del worker en el navegador:
//       debe decir "✅ Supabase despierto".
// ============================================================================

// ⬇️ Las mismas 2 que pusiste en web/js/config.js
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PEGA_AQUI_TU_CLAVE_PUBLICABLE';

async function despertar() {
  const cabeceras = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  // Las claves clásicas (anon, empiezan por "eyJ") también van en Authorization
  if (SUPABASE_KEY.startsWith('eyJ')) cabeceras.Authorization = `Bearer ${SUPABASE_KEY}`;
  const respuesta = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/ping`, {
    method: 'POST',
    headers: cabeceras,
    body: '{}',
  });
  return { estado: respuesta.status, texto: (await respuesta.text()).slice(0, 200) };
}

export default {
  // Lo llama Cloudflare solo, según el "Cron Trigger"
  async scheduled(_evento, _env, ctx) {
    ctx.waitUntil(
      despertar()
        .then((r) => console.log(`Despertador: ${r.estado} ${r.texto}`))
        .catch((error) => console.error('Despertador falló:', error)),
    );
  },

  // Abrir la dirección del worker en el navegador = probarlo a mano
  async fetch() {
    try {
      const r = await despertar();
      const bien = r.estado === 200;
      return new Response(bien ? '✅ Supabase despierto (respondió "ok")' : `⚠️ Supabase respondió ${r.estado}: ${r.texto}`, {
        status: bien ? 200 : 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      return new Response(`⚠️ No se pudo contactar a Supabase: ${error}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
