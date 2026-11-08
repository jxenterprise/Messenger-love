-- ============================================================================
--  Messenger Estrellita y Jampier ❤️ — Estructura de la base de datos
-- ----------------------------------------------------------------------------
--  CÓMO USARLO: Supabase → SQL Editor → New query → pega TODO este archivo
--  → Run. Al final debe salir "Listo ✅".
--  Se puede ejecutar varias veces sin dañar nada (no borra mensajes).
--
--  Qué crea:
--   1. perfiles            → nombre, foto, "en línea" y preferencia de avisos
--   2. mensajes            → texto, fotos, notas de voz y "Te extraño"
--   3. suscripciones_push  → los celulares que reciben notificaciones
--   4. Reglas de seguridad (RLS): solo las 2 cuentas ven y escriben,
--      y nunca puede existir una tercera cuenta.
--   5. Funciones seguras para leído/entregado, reacciones, editar y borrar.
--   6. Tiempo real (canal privado "pareja-eyj") y bucket privado "media".
-- ============================================================================


-- ============================================================================
-- 1) TABLAS
-- ============================================================================
create table if not exists public.perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null default 'Mi amor' check (char_length(nombre) between 1 and 40),
  avatar_path     text,
  notif_con_texto boolean not null default false,   -- ¿el aviso muestra el texto del mensaje?
  en_app          boolean not null default false,   -- ¿tiene la app abierta ahora?
  visto_en        timestamptz,                      -- última vez que estuvo en la app
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Usuario para entrar (jampier, estrellita…). Se agrega aparte para que el
-- archivo también sirva en bases creadas con la versión anterior.
alter table public.perfiles add column if not exists usuario text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_usuario_formato') then
    alter table public.perfiles
      add constraint perfiles_usuario_formato check (usuario is null or usuario ~ '^[a-z0-9._-]{2,30}$');
  end if;
end;
$$;
create unique index if not exists perfiles_usuario_idx on public.perfiles (usuario);

-- Ajustes de cada uno (tema, fondo, sonido, bloqueo, avisos…): se guardan aquí
-- para que NUNCA se reinicien, aunque cierre sesión o cambie de celular.
alter table public.perfiles add column if not exists preferencias jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfiles_preferencias_validas') then
    alter table public.perfiles
      add constraint perfiles_preferencias_validas
      check (jsonb_typeof(preferencias) = 'object' and pg_column_size(preferencias) <= 2000);
  end if;
end;
$$;

create table if not exists public.mensajes (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null unique,              -- lo crea el celular: evita duplicados al reintentar
  -- "restrict": si alguien intenta borrar una cuenta que tiene mensajes, Supabase
  -- lo impide. Así la conversación nunca se pierde por un clic equivocado.
  remitente       uuid not null default auth.uid() references public.perfiles (id) on delete restrict,
  tipo            text not null default 'texto' check (tipo in ('texto', 'imagen', 'audio', 'te_extrano')),
  contenido       text check (contenido is null or char_length(contenido) <= 5000),
  media_path      text,                              -- ruta en el bucket "media"
  media_meta      jsonb,                             -- ancho/alto/miniatura de la foto, duración/onda del audio
  responde_a      uuid references public.mensajes (id) on delete set null,
  reacciones      jsonb not null default '{}'::jsonb, -- { "id-de-usuario": "❤️" }
  editado_en      timestamptz,
  borrado         boolean not null default false,
  entregado_en    timestamptz,
  leido_en        timestamptz,
  notificado_en   timestamptz,                       -- cuándo se mandó el aviso push
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint mensaje_valido check (
    borrado
    or (tipo = 'texto' and contenido is not null and char_length(btrim(contenido)) > 0)
    or (tipo in ('imagen', 'audio') and media_path is not null)
    or (tipo = 'te_extrano')
  )
);

create index if not exists mensajes_creado_idx      on public.mensajes (creado_en desc);
create index if not exists mensajes_actualizado_idx on public.mensajes (actualizado_en);
create index if not exists mensajes_remitente_idx   on public.mensajes (remitente, creado_en desc);
create index if not exists mensajes_responde_idx    on public.mensajes (responde_a);

create table if not exists public.suscripciones_push (
  id          bigint generated always as identity primary key,
  usuario     uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  dispositivo text,
  creado_en   timestamptz not null default now()
);

create index if not exists suscripciones_usuario_idx on public.suscripciones_push (usuario);


-- ============================================================================
-- 2) FUNCIONES DE APOYO Y DISPARADORES
-- ============================================================================

-- Esquema interno: lo que hay aquí NO se puede llamar desde internet
create schema if not exists privado;
grant usage on schema privado to authenticated;

-- ¿Quien hace la petición es una de las 2 cuentas?
create or replace function privado.es_miembro()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.perfiles where id = auth.uid());
$$;

revoke execute on function privado.es_miembro() from public, anon;
grant execute on function privado.es_miembro() to authenticated;

-- Hora del servidor en "actualizado_en" en cada cambio (la usa la sincronización)
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Usuario para entrar, sacado del correo de la cuenta:
--   jampier@lo-que-sea.com            → jampier
--   tucorreo+estrellita@gmail.com     → estrellita   (lo que va después del "+")
-- También se puede poner a mano en los "metadatos" de la cuenta: {"usuario": "jampier"}
create or replace function privado.usuario_desde_correo(p_correo text, p_meta jsonb)
returns text
language sql immutable
set search_path = ''
as $$
  select nullif(left(regexp_replace(lower(coalesce(
           nullif(btrim(p_meta ->> 'usuario'), ''),
           case when split_part(p_correo, '@', 1) like '%+%'
                then split_part(split_part(p_correo, '@', 1), '+', 2)
                else split_part(p_correo, '@', 1) end
         )), '[^a-z0-9._-]', '', 'g'), 30), '');
$$;

-- Si ese usuario ya lo tiene la otra cuenta, se le agrega un número
create or replace function privado.usuario_libre(p_base text, p_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  candidato text := p_base;
  n integer := 2;
begin
  if p_base is null or char_length(p_base) < 2 then
    return null;
  end if;
  while exists (select 1 from public.perfiles where usuario = candidato and id <> p_id) loop
    candidato := left(p_base, 28) || n;
    n := n + 1;
  end loop;
  return candidato;
end;
$$;

-- Al crear una cuenta en Authentication se crea su perfil.
-- Si ya hay 2 cuentas, la tercera NO se puede crear.
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  total integer;
begin
  lock table public.perfiles in share row exclusive mode;
  select count(*) into total from public.perfiles;
  if total >= 2 then
    raise exception 'Este messenger es solo para dos personas: ya existen las 2 cuentas.';
  end if;
  insert into public.perfiles (id, nombre, usuario)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
                  initcap(privado.usuario_desde_correo(new.email, new.raw_user_meta_data)), 'Mi amor'), 40),
    privado.usuario_libre(privado.usuario_desde_correo(new.email, new.raw_user_meta_data), new.id)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Perfiles para cuentas creadas ANTES de correr este archivo (máximo 2)
insert into public.perfiles (id, nombre)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nombre'), ''),
                     initcap(privado.usuario_desde_correo(u.email, u.raw_user_meta_data)), 'Mi amor'), 40)
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id)
order by u.created_at
limit greatest(0, 2 - (select count(*) from public.perfiles));

-- Perfiles que todavía no tienen usuario (bases de la versión anterior)
do $$
declare
  fila record;
begin
  for fila in
    select p.id, u.email, u.raw_user_meta_data
      from public.perfiles p join auth.users u on u.id = p.id
     where p.usuario is null
     order by p.creado_en
  loop
    update public.perfiles
       set usuario = privado.usuario_libre(privado.usuario_desde_correo(fila.email, fila.raw_user_meta_data), fila.id)
     where id = fila.id;
  end loop;
end;
$$;

-- Al guardar un mensaje, el servidor fija los datos que no dependen del celular
create or replace function public.preparar_mensaje()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.remitente      := coalesce(auth.uid(), new.remitente);
  new.creado_en      := now();
  new.actualizado_en := now();
  new.reacciones     := '{}'::jsonb;
  new.editado_en     := null;
  new.borrado        := false;
  new.entregado_en   := null;
  new.leido_en       := null;
  new.notificado_en  := null;
  if new.media_path is not null and split_part(new.media_path, '/', 1) <> new.remitente::text then
    raise exception 'Ese archivo no es tuyo.';
  end if;
  if new.media_meta is not null and pg_column_size(new.media_meta) > 16000 then
    raise exception 'Los datos del archivo son demasiado grandes.';
  end if;
  return new;
end;
$$;

drop trigger if exists mensajes_antes_de_guardar on public.mensajes;
create trigger mensajes_antes_de_guardar
  before insert on public.mensajes
  for each row execute function public.preparar_mensaje();

drop trigger if exists mensajes_actualizado on public.mensajes;
create trigger mensajes_actualizado
  before update on public.mensajes
  for each row execute function public.tocar_actualizado();

drop trigger if exists perfiles_actualizado on public.perfiles;
create trigger perfiles_actualizado
  before update on public.perfiles
  for each row execute function public.tocar_actualizado();

-- Las funciones de los disparadores no se llaman desde la app
revoke execute on function public.tocar_actualizado(), public.crear_perfil(), public.preparar_mensaje()
  from public, anon, authenticated;


-- ============================================================================
-- 3) FUNCIONES QUE LLAMA LA APP (seguras: cada una revisa quién llama)
-- ============================================================================

-- "Sigo en la app" / "ya salí" → en línea y últ. vez
create or replace function public.latido(p_en_app boolean default true)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.perfiles
     set en_app = coalesce(p_en_app, false), visto_en = now()
   where id = auth.uid();
end;
$$;

-- ✓✓ entregado: los mensajes de la otra persona llegaron a mi celular
create or replace function public.marcar_entregados()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  update public.mensajes
     set entregado_en = now()
   where remitente <> auth.uid() and entregado_en is null;
end;
$$;

-- ✓✓ de color: leí los mensajes de la otra persona
create or replace function public.marcar_leidos()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  update public.mensajes
     set leido_en = now(), entregado_en = coalesce(entregado_en, now())
   where remitente <> auth.uid() and leido_en is null;
end;
$$;

-- Reaccionar con un emoji (o quitar la reacción con p_emoji = null)
create or replace function public.reaccionar(p_mensaje uuid, p_emoji text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  if p_emoji is not null and char_length(p_emoji) > 16 then
    raise exception 'Reacción no válida.';
  end if;
  update public.mensajes
     set reacciones = case
                        when coalesce(p_emoji, '') = '' then reacciones - auth.uid()::text
                        else reacciones || jsonb_build_object(auth.uid()::text, p_emoji)
                      end
   where id = p_mensaje and not borrado;
end;
$$;

-- Editar un mensaje propio de texto (durante 15 minutos, como WhatsApp)
create or replace function public.editar_mensaje(p_mensaje uuid, p_texto text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  if p_texto is null or char_length(btrim(p_texto)) = 0 or char_length(p_texto) > 5000 then
    raise exception 'El mensaje no puede quedar vacío.';
  end if;
  update public.mensajes
     set contenido = p_texto, editado_en = now()
   where id = p_mensaje
     and remitente = auth.uid()
     and tipo = 'texto'
     and not borrado
     and creado_en > now() - interval '15 minutes';
  if not found then
    raise exception 'Ya no se puede editar este mensaje: solo se puede durante 15 minutos.';
  end if;
end;
$$;

-- Eliminar para los dos. Devuelve la ruta del archivo para que la app lo borre.
create or replace function public.borrar_mensaje(p_mensaje uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  ruta text;
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  select media_path into ruta
    from public.mensajes
   where id = p_mensaje and remitente = auth.uid() and not borrado;
  if not found then
    raise exception 'Solo puedes eliminar tus propios mensajes.';
  end if;
  update public.mensajes
     set borrado = true, contenido = null, media_path = null, media_meta = null, reacciones = '{}'::jsonb
   where id = p_mensaje;
  return ruta;
end;
$$;

-- Registrar este celular para los avisos. Si el celular estaba registrado
-- con la otra cuenta (cerraron sesión y entró la otra persona), pasa a esta.
create or replace function public.guardar_suscripcion(
  p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  insert into public.suscripciones_push (usuario, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200))
  on conflict (endpoint) do update
     set usuario     = excluded.usuario,
         p256dh      = excluded.p256dh,
         auth        = excluded.auth,
         dispositivo = excluded.dispositivo,
         creado_en   = now();
end;
$$;

-- Para el "despertador" diario (evita que Supabase pause el proyecto gratis)
create or replace function public.ping()
returns text
language sql stable
set search_path = ''
as $$
  select 'ok'::text;
$$;


-- ============================================================================
-- 4) PERMISOS: nadie anónimo toca nada; los miembros, solo lo necesario
-- ============================================================================
revoke all on table public.perfiles, public.mensajes, public.suscripciones_push from anon, authenticated;

grant select on table public.perfiles to authenticated;
grant update (nombre, avatar_path, notif_con_texto, preferencias) on table public.perfiles to authenticated;

grant select on table public.mensajes to authenticated;
grant insert (client_id, remitente, tipo, contenido, media_path, media_meta, responde_a) on table public.mensajes to authenticated;

grant select, delete on table public.suscripciones_push to authenticated;

revoke execute on function
  public.latido(boolean),
  public.marcar_entregados(),
  public.marcar_leidos(),
  public.reaccionar(uuid, text),
  public.editar_mensaje(uuid, text),
  public.borrar_mensaje(uuid),
  public.guardar_suscripcion(text, text, text, text)
from public, anon;

grant execute on function
  public.latido(boolean),
  public.marcar_entregados(),
  public.marcar_leidos(),
  public.reaccionar(uuid, text),
  public.editar_mensaje(uuid, text),
  public.borrar_mensaje(uuid),
  public.guardar_suscripcion(text, text, text, text)
to authenticated;

grant execute on function public.ping() to anon, authenticated;


-- ============================================================================
-- 5) REGLAS DE SEGURIDAD (RLS)
-- ============================================================================
alter table public.perfiles           enable row level security;
alter table public.mensajes           enable row level security;
alter table public.suscripciones_push enable row level security;

-- Perfiles
drop policy if exists "perfiles: los miembros los ven" on public.perfiles;
create policy "perfiles: los miembros los ven" on public.perfiles
  for select to authenticated
  using ((select privado.es_miembro()));

drop policy if exists "perfiles: cada uno edita el suyo" on public.perfiles;
create policy "perfiles: cada uno edita el suyo" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Mensajes (los cambios pasan por las funciones seguras de arriba)
drop policy if exists "mensajes: los miembros los leen" on public.mensajes;
create policy "mensajes: los miembros los leen" on public.mensajes
  for select to authenticated
  using ((select privado.es_miembro()));

drop policy if exists "mensajes: los miembros escriben" on public.mensajes;
create policy "mensajes: los miembros escriben" on public.mensajes
  for insert to authenticated
  with check ((select privado.es_miembro()) and remitente = (select auth.uid()));

-- Suscripciones push (se guardan con guardar_suscripcion; cada quien ve y borra las suyas)
drop policy if exists "push: guardar las propias" on public.suscripciones_push;
drop policy if exists "push: actualizar las propias" on public.suscripciones_push;

drop policy if exists "push: ver las propias" on public.suscripciones_push;
create policy "push: ver las propias" on public.suscripciones_push
  for select to authenticated
  using (usuario = (select auth.uid()));

drop policy if exists "push: borrar las propias" on public.suscripciones_push;
create policy "push: borrar las propias" on public.suscripciones_push
  for delete to authenticated
  using (usuario = (select auth.uid()));


-- ============================================================================
-- 6) TIEMPO REAL
-- ============================================================================
-- Los cambios de "mensajes" se transmiten al instante (respetando las reglas RLS)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mensajes'
  ) then
    alter publication supabase_realtime add table public.mensajes;
  end if;
end;
$$;

-- Canal PRIVADO "pareja-eyj": "en línea" y "escribiendo…" solo para las 2 cuentas
drop policy if exists "pareja: escuchar su canal" on realtime.messages;
create policy "pareja: escuchar su canal" on realtime.messages
  for select to authenticated
  using (
    (select privado.es_miembro())
    and (select realtime.topic()) = 'pareja-eyj'
    and realtime.messages.extension in ('broadcast', 'presence')
  );

drop policy if exists "pareja: hablar en su canal" on realtime.messages;
create policy "pareja: hablar en su canal" on realtime.messages
  for insert to authenticated
  with check (
    (select privado.es_miembro())
    and (select realtime.topic()) = 'pareja-eyj'
    and realtime.messages.extension in ('broadcast', 'presence')
  );


-- ============================================================================
-- 7) FOTOS Y NOTAS DE VOZ: bucket privado "media"
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 15728640,  -- 15 MB por archivo
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif',
        'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/mpeg']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada archivo vive en la carpeta de quien lo subió: media/<id-de-usuario>/...
drop policy if exists "media: los miembros ven" on storage.objects;
create policy "media: los miembros ven" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (select privado.es_miembro()));

drop policy if exists "media: subir a la carpeta propia" on storage.objects;
create policy "media: subir a la carpeta propia" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select privado.es_miembro())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "media: reemplazar en la carpeta propia" on storage.objects;
create policy "media: reemplazar en la carpeta propia" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "media: borrar en la carpeta propia" on storage.objects;
create policy "media: borrar en la carpeta propia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- ============================================================================
-- 8) ENTRAR CON USUARIO + PIN (el mismo PIN de 4 números para los dos)
-- ----------------------------------------------------------------------------
--  · El PIN se guarda cifrado con bcrypt (nunca tal cual).
--  · Lo revisa SOLO el servidor: la función "entrar-con-pin" llama a
--    verificar_acceso (nadie más puede llamarla).
--  · 5 fallos seguidos → esperar 15 minutos. 15 fallos → la cuenta queda
--    bloqueada hasta desbloquearla con supabase/03_pin.sql.
--  · Los celulares que ya habían entrado siguen funcionando aunque haya un
--    bloqueo: solo se bloquea entrar de nuevo.
-- ============================================================================
create table if not exists privado.acceso_pin (
  id          boolean primary key default true check (id),  -- una sola fila
  pin_hash    text not null,
  version     integer not null default 1,                  -- sube cada vez que cambia el PIN
  cambiado_en timestamptz not null default now()
);

create table if not exists privado.acceso_intentos (
  usuario       uuid primary key references public.perfiles (id) on delete cascade,
  fallos        integer not null default 0,   -- fallos seguidos (vuelve a 0 al acertar)
  esperar_hasta timestamptz,
  bloqueado     boolean not null default false,
  ultimo_fallo  timestamptz
);

alter table privado.acceso_pin      enable row level security;
alter table privado.acceso_intentos enable row level security;
revoke all on table privado.acceso_pin, privado.acceso_intentos from public, anon, authenticated;

-- PINs que no se aceptan por ser los primeros que alguien probaría
create or replace function privado.pin_debil(p_pin text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_pin ~ '^(\d)\1{3}$'                                   -- 0000, 1111…
      or p_pin in ('1234', '2345', '3456', '4567', '5678', '6789', '0123',
                   '4321', '9876', '8765', '7654', '6543', '5432', '3210',
                   '1212', '1122', '2580', '0852', '1004', '2000', '6969');
$$;

-- Revisa el PIN de una cuenta y lleva la cuenta de los fallos.
-- Devuelve {ok, motivo, segundos, restantes, version}.
create or replace function privado.probar_pin(p_id uuid, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  conf privado.acceso_pin;
  r    privado.acceso_intentos;
begin
  select * into conf from privado.acceso_pin where id;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'sin-pin');
  end if;

  insert into privado.acceso_intentos (usuario) values (p_id) on conflict (usuario) do nothing;
  select * into r from privado.acceso_intentos where usuario = p_id for update;  -- uno a la vez

  if r.bloqueado then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  end if;
  if r.esperar_hasta is not null and r.esperar_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'esperar',
                              'segundos', ceil(extract(epoch from r.esperar_hasta - now()))::integer);
  end if;

  if coalesce(p_pin, '') ~ '^[0-9]{4}$' and extensions.crypt(p_pin, conf.pin_hash) = conf.pin_hash then
    update privado.acceso_intentos set fallos = 0, esperar_hasta = null where usuario = p_id;
    return jsonb_build_object('ok', true, 'version', conf.version);
  end if;

  r.fallos := r.fallos + 1;
  update privado.acceso_intentos
     set fallos        = r.fallos,
         ultimo_fallo  = now(),
         bloqueado     = r.fallos >= 15,
         esperar_hasta = case when r.fallos < 15 and r.fallos % 5 = 0 then now() + interval '15 minutes' end
   where usuario = p_id;

  if r.fallos >= 15 then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado');
  elsif r.fallos % 5 = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'esperar', 'segundos', 900);
  end if;
  return jsonb_build_object('ok', false, 'motivo', 'datos', 'restantes', 15 - r.fallos);
end;
$$;

-- La llama SOLO la función "entrar-con-pin" (con la clave secreta del servidor).
-- Responde igual si el usuario no existe o si el PIN está mal.
create or replace function public.verificar_acceso(p_usuario text, p_pin text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  resultado jsonb;
begin
  select id into v_id from public.perfiles where usuario = lower(btrim(coalesce(p_usuario, '')));
  if v_id is null then
    -- Mismo trabajo que un PIN equivocado, para no delatar qué usuarios existen
    perform extensions.crypt('0000', extensions.gen_salt('bf', 10));
    return jsonb_build_object('ok', false, 'motivo', 'datos');
  end if;
  resultado := privado.probar_pin(v_id, p_pin);
  if (resultado ->> 'ok')::boolean then
    resultado := resultado || jsonb_build_object('id', v_id);
  end if;
  return resultado;
end;
$$;

-- Cambiar el PIN desde la app (Ajustes). Cambia para LOS DOS.
-- Devuelve {ok, version} o {ok:false, motivo, …}. Un PIN actual equivocado
-- NO lanza error a propósito: así el intento fallido queda contado (un error
-- desharía también el conteo y permitiría probar PINs sin límite).
drop function if exists public.cambiar_pin(text, text);  -- por si quedó una versión que devolvía otro tipo
create function public.cambiar_pin(p_actual text, p_nuevo text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb;
  v integer;
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  -- Primero lo que no depende del PIN actual (estos errores no cuentan como intento)
  if coalesce(p_nuevo, '') !~ '^[0-9]{4}$' then
    raise exception 'El PIN nuevo debe tener 4 números.';
  end if;
  if p_nuevo = p_actual then
    raise exception 'El PIN nuevo es igual al actual.';
  end if;
  if privado.pin_debil(p_nuevo) then
    raise exception 'Ese PIN es muy fácil de adivinar. Elige otro.';
  end if;
  r := privado.probar_pin(auth.uid(), p_actual);
  if not (r ->> 'ok')::boolean then
    return r;
  end if;
  update privado.acceso_pin
     set pin_hash = extensions.crypt(p_nuevo, extensions.gen_salt('bf', 10)),
         version = version + 1,
         cambiado_en = now()
   where id
  returning version into v;
  return jsonb_build_object('ok', true, 'version', v);
end;
$$;

-- La app lo pregunta al abrir: si el PIN cambió en el otro celular, pide el nuevo
create or replace function public.version_pin()
returns integer
language sql stable security definer
set search_path = ''
as $$
  select case when privado.es_miembro() then (select version from privado.acceso_pin where id) end;
$$;

-- ---- Solo para el SQL Editor (los usa supabase/03_pin.sql) ----
create or replace function privado.poner_pin(p_pin text)
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'El PIN debe tener exactamente 4 números.';
  end if;
  if privado.pin_debil(p_pin) then
    raise exception 'Ese PIN es muy fácil de adivinar (por ejemplo 1234 o 0000). Elige otro.';
  end if;
  insert into privado.acceso_pin (id, pin_hash)
  values (true, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)))
  on conflict (id) do update
     set pin_hash = excluded.pin_hash,
         version = privado.acceso_pin.version + 1,
         cambiado_en = now();
  update privado.acceso_intentos set fallos = 0, esperar_hasta = null, bloqueado = false;
  return 'PIN guardado ✅';
end;
$$;

create or replace function privado.desbloquear()
returns text
language plpgsql security definer
set search_path = ''
as $$
begin
  update privado.acceso_intentos set fallos = 0, esperar_hasta = null, bloqueado = false;
  return 'Cuentas desbloqueadas ✅';
end;
$$;

-- Permisos: lo interno no se llama desde internet
revoke execute on function
  privado.usuario_desde_correo(text, jsonb),
  privado.usuario_libre(text, uuid),
  privado.pin_debil(text),
  privado.probar_pin(uuid, text),
  privado.poner_pin(text),
  privado.desbloquear()
from public, anon, authenticated;

revoke execute on function public.verificar_acceso(text, text) from public, anon, authenticated;
grant execute on function public.verificar_acceso(text, text) to service_role;

revoke execute on function public.cambiar_pin(text, text), public.version_pin() from public, anon;
grant execute on function public.cambiar_pin(text, text), public.version_pin() to authenticated;


-- ============================================================================
-- 9) VACIAR EL CHAT (borrar TODOS los mensajes, para los dos)
-- ----------------------------------------------------------------------------
--  · vaciar_chat() borra todos los mensajes y devuelve las rutas de sus fotos
--    y notas de voz para que la app las borre del depósito "media".
--  · chat_estado guarda cuándo se vació: el otro celular se entera al
--    instante (tiempo real) o la próxima vez que abra la app, y limpia lo
--    que tenga guardado.
--  · Archivos que ya ningún mensaje ni foto de perfil usa: cualquiera de los
--    dos los puede borrar (así se borran también las fotos del otro).
-- ============================================================================
create table if not exists public.chat_estado (
  id          boolean primary key default true check (id),  -- una sola fila
  vaciado_en  timestamptz,
  vaciado_por uuid references public.perfiles (id) on delete set null
);

alter table public.chat_estado enable row level security;
revoke all on table public.chat_estado from anon, authenticated;
grant select on table public.chat_estado to authenticated;

drop policy if exists "chat: los miembros lo ven" on public.chat_estado;
create policy "chat: los miembros lo ven" on public.chat_estado
  for select to authenticated
  using ((select privado.es_miembro()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_estado'
  ) then
    alter publication supabase_realtime add table public.chat_estado;
  end if;
end;
$$;

create or replace function public.vaciar_chat()
returns text[]
language plpgsql security definer
set search_path = ''
as $$
declare
  rutas text[];
begin
  if not privado.es_miembro() then
    raise exception 'No autorizado.';
  end if;
  select coalesce(array_agg(media_path) filter (where media_path is not null), '{}')
    into rutas
    from public.mensajes;
  delete from public.mensajes where id is not null;  -- (el "where" lo exige Supabase)
  insert into public.chat_estado (id, vaciado_en, vaciado_por)
  values (true, now(), auth.uid())
  on conflict (id) do update
     set vaciado_en = excluded.vaciado_en,
         vaciado_por = excluded.vaciado_por;
  return rutas;
end;
$$;

-- ¿Algún mensaje o foto de perfil usa todavía este archivo?
create or replace function privado.archivo_en_uso(p_ruta text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.mensajes where media_path = p_ruta)
      or exists (select 1 from public.perfiles where avatar_path = p_ruta);
$$;

drop policy if exists "media: borrar archivos que ya nadie usa" on storage.objects;
create policy "media: borrar archivos que ya nadie usa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select privado.es_miembro()) and not privado.archivo_en_uso(name));

revoke execute on function public.vaciar_chat() from public, anon;
grant execute on function public.vaciar_chat() to authenticated;
revoke execute on function privado.archivo_en_uso(text) from public, anon;
grant execute on function privado.archivo_en_uso(text) to authenticated;


-- ============================================================================
-- Listo
-- ============================================================================
select 'Listo ✅' as resultado,
       (select count(*) from public.perfiles) as cuentas_con_perfil,
       (select string_agg(usuario, ', ' order by creado_en) from public.perfiles) as usuarios,
       case when exists (select 1 from privado.acceso_pin) then 'sí' else 'falta: corre supabase/03_pin.sql' end as pin_creado;
