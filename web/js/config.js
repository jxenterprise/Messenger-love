/* ==========================================================================
   config.js — ✏️ ZONA EDITABLE: aquí conectas la app con tu Supabase
   --------------------------------------------------------------------------
   Mientras SUPABASE_URL o SUPABASE_KEY estén vacíos, la app abre en
   MODO DEMO (mensajes de ejemplo que no salen del dispositivo).
   La guía paso a paso está en el README.md del proyecto.
   ========================================================================== */

export const CONFIG = {
  // 1) URL del proyecto. Supabase → Project Settings → Data API → "Project URL"
  //    Ejemplo: 'https://abcdefghijkl.supabase.co'
  SUPABASE_URL: '',

  // 2) Clave PÚBLICA. Supabase → Project Settings → API Keys →
  //    "Publishable key" (empieza por sb_publishable_) o, si usas las
  //    antiguas, la "anon public". Es pública por diseño: lo que protege los
  //    datos son las reglas RLS del archivo supabase/01_estructura.sql.
  //    ⚠️ NUNCA pegues aquí la "secret key" ni la "service_role".
  SUPABASE_KEY: '',

  // 3) Clave pública VAPID para las notificaciones push.
  //    Genérala con herramientas/generar-claves-vapid.html
  //    (la privada va SOLO en los secretos de Supabase, nunca aquí).
  VAPID_PUBLIC_KEY: '',

  // Datos de la app
  NOMBRE_APP: 'Messenger Estrellita y Jampier',
  VERSION: '1.0.0',
};

/** true cuando la app debe funcionar con mensajes de ejemplo. */
export const MODO_DEMO =
  window.__VISTA_PREVIA__ === true || !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY;
