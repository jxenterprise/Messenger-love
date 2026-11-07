-- ============================================================================
--  Messenger Estrellita y Jampier ❤️ — El PIN para entrar
-- ----------------------------------------------------------------------------
--  Los dos entran con su USUARIO (jampier / estrellita) y el MISMO PIN de
--  4 números. Este archivo sirve para:
--    · Crear el PIN la primera vez.
--    · Ponerlo de nuevo si a los dos se les olvidó.
--    · Desbloquear las cuentas tras muchos intentos fallidos.
--  (Si los dos recuerdan el PIN, es más fácil cambiarlo desde la app:
--   Ajustes → Seguridad → Cambiar PIN.)
--
--  CÓMO USARLO: Supabase → SQL Editor → New query → pega esto → cambia
--  el 0000 por su PIN → Run. Debe salir "PIN guardado ✅".
--
--  Reglas: exactamente 4 números y nada muy fácil (1234, 0000, 1111, 2580…).
--  Poner el PIN también desbloquea las cuentas.
-- ============================================================================
select privado.poner_pin('0000');   -- ✏️ cambia 0000 por su PIN


-- ----------------------------------------------------------------------------
--  ¿Solo quieres desbloquear sin cambiar el PIN? Borra la línea de arriba,
--  quita los dos guiones (--) de la siguiente línea y dale Run:
-- ----------------------------------------------------------------------------
-- select privado.desbloquear();


-- ----------------------------------------------------------------------------
--  ¿Quieres ver los usuarios y si hay alguno bloqueado? Corre esto aparte:
-- ----------------------------------------------------------------------------
-- select p.usuario, p.nombre, coalesce(i.fallos, 0) as fallos_seguidos,
--        i.esperar_hasta, coalesce(i.bloqueado, false) as bloqueado
--   from public.perfiles p left join privado.acceso_intentos i on i.usuario = p.id
--  order by p.creado_en;
