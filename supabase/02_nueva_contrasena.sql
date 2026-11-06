-- ============================================================================
--  Messenger Estrellita y Jampier ❤️ — Poner una contraseña nueva
-- ----------------------------------------------------------------------------
--  Úsalo SOLO si alguno olvidó su contraseña y no puede entrar.
--  (Si sí puede entrar, es mejor cambiarla desde la app: Ajustes → Cuenta.)
--
--  1. Cambia el correo y la contraseña nueva (entre las comillas).
--  2. Supabase → SQL Editor → New query → pega esto → Run.
--  3. Debe salir "Contraseña cambiada ✅". Entra a la app con la nueva y
--     después cámbiala desde Ajustes para que solo esa persona la sepa.
--
--  No se borra ningún mensaje. NUNCA borres la cuenta para "arreglarlo".
-- ============================================================================
with cambio as (
  update auth.users
     set encrypted_password = extensions.crypt('ESCRIBE-AQUI-LA-NUEVA', extensions.gen_salt('bf', 10)),
         updated_at = now()
   where email = lower(trim('correo@ejemplo.com'))
  returning email
)
select case when count(*) = 1 then 'Contraseña cambiada ✅'
            else 'No encontré ese correo ❌ (revisa que esté bien escrito)' end as resultado
from cambio;
