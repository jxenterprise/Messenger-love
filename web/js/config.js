/* ==========================================================================
   config.js — ✏️ ZONA EDITABLE: aquí conectas la app con tu Supabase
   --------------------------------------------------------------------------
   Mientras SUPABASE_URL o SUPABASE_KEY estén vacíos, la app publicada
   muestra la pantalla "Casi listo" (sin mensajes de ejemplo ni respuestas
   automáticas). Apenas pegues los 2 datos, sale la pantalla para entrar con
   correo y contraseña y los mensajes son 100 % reales entre ustedes dos.
   La guía paso a paso está en el README.md del proyecto.
   ========================================================================== */

export const CONFIG = {
  // 1) URL del proyecto. Supabase → Project Settings → Data API → "Project URL"
  //    Ejemplo: 'https://abcdefghijkl.supabase.co'
  SUPABASE_URL: 'https://kcxhaducunhulfuiipfe.supabase.co',

  // 2) Clave PÚBLICA. Supabase → Project Settings → API Keys →
  //    "Publishable key" (empieza por sb_publishable_) o, si usas las
  //    antiguas, la "anon public". Es pública por diseño: lo que protege los
  //    datos son las reglas RLS del archivo supabase/01_estructura.sql.
  //    ⚠️ NUNCA pegues aquí la "secret key" ni la "service_role".
  SUPABASE_KEY: 'sb_publishable_wNq5zmbzJ6opE_bm7qn3-w_cSW4Jc_p',

  // 3) Clave pública VAPID para las notificaciones push.
  //    Genérala con herramientas/generar-claves-vapid.html
  //    (la privada va SOLO en los secretos de Supabase, nunca aquí).
  VAPID_PUBLIC_KEY: 'BE_Jk18lHmCaWp9skthVK24Qx3-lWB8CF-STN_o5I2ZEZIfJRqE00_vuNhibx6onHTGWIItijDvnF8VKAa9o6D0',

  // 4) Quiénes entran: un botón "Soy …" por persona en la pantalla de entrada.
  //    "usuario" debe ser IGUAL al de la columna usuario de la tabla perfiles
  //    en Supabase. "nombre" es lo que dice el botón.
  PERSONAS: [
    { usuario: 'jampier', nombre: 'Jampier' },
    { usuario: 'estrellita', nombre: 'Estrellita' },
  ],

  // Datos de la app
  NOMBRE_APP: 'Messenger Estrellita y Jampier',
  // Versión visible debajo de "Nuestro rincón privado" (v1.4).
  // Numeración: 1.0, 1.1, 1.2 … hasta 1.50; después pasa a 2.0.
  // ✏️ Súbela en cada entrega (y también VERSION en web/sw.js).
  VERSION: '1.7',
};

/* --------------------------------------------------------------------------
   ⛔ De aquí para abajo no hay que tocar nada.
   -------------------------------------------------------------------------- */

// Limpia lo que se pegue de más: espacios, o "/" y "/rest/v1/" al final de la URL
CONFIG.SUPABASE_URL = String(CONFIG.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
CONFIG.SUPABASE_KEY = String(CONFIG.SUPABASE_KEY || '').trim();
CONFIG.VAPID_PUBLIC_KEY = String(CONFIG.VAPID_PUBLIC_KEY || '').trim();

/** ¿Pegaron por error la clave SECRETA (sb_secret_… o la service_role)? Esa abre toda la base de datos. */
function esClaveSecreta(clave) {
  if (/^sb_secret_/i.test(clave)) return true;
  const partes = clave.split('.');
  if (partes.length !== 3) return false;
  try {
    return JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/')))?.role === 'service_role';
  } catch {
    return false;
  }
}

/** true si en SUPABASE_KEY quedó la clave secreta: la app se niega a usarla. */
export const CLAVE_PELIGROSA = esClaveSecreta(CONFIG.SUPABASE_KEY);

/** true cuando ya están los datos de Supabase (y la clave es la pública). */
export const CONECTADA = !!CONFIG.SUPABASE_URL && !!CONFIG.SUPABASE_KEY && !CLAVE_PELIGROSA;

// El modo demo (pareja simulada que responde sola) solo existe en la vista
// previa, en el computador de pruebas (localhost) o abriendo la app con ?demo.
const enEsteEquipo = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const pideDemo = new URLSearchParams(location.search).has('demo');

/** true cuando la app debe funcionar con mensajes de ejemplo (nada sale del dispositivo). */
export const MODO_DEMO =
  window.__VISTA_PREVIA__ === true || (!CONECTADA && !CLAVE_PELIGROSA && (enEsteEquipo || pideDemo));

/** true cuando la app está publicada pero todavía no se conectó con Supabase. */
export const FALTA_CONEXION = !MODO_DEMO && !CONECTADA;
