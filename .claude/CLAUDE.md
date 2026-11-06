# CLAUDE.md — Messenger Estrellita y Jampier ❤️

Contexto para retomar este proyecto en otra sesión. Léelo completo antes de tocar código.

## Qué es

Chat privado (PWA) para exactamente **2 personas**: Jampier (JX, dueño del proyecto) y Estrellita, su novia. Proyecto **personal**: no lleva el crédito "Diseño y desarrollo: JX Company". Nombre: "Messenger Estrellita y Jampier ❤️"; nombre corto en el ícono: "E ❤ J".

- Front: HTML + CSS + JS (módulos ES, sin framework ni build) en `web/`, publicado en Cloudflare Pages **conectado al repo de GitHub** `jxenterprise/Messenger-love` (público). Rama `main` = producción: cada push a `main` publica solo; las demás ramas generan vistas previas. Proyecto: `messenger-estrellita-jampier-18.pages.dev`.
  - **`wrangler.toml` en la raíz** (`name = "messenger-estrellita-jampier-18"`, `pages_build_output_dir = "web"`) fija qué se publica; es la fuente de verdad y el campo del panel queda bloqueado. Verificado el 6 nov 2026 en una vista previa: `/` 200 con la app y `_headers` aplicadas; README, SQL, `.claude/` y `wrangler.toml` dan 404. `name` debe ser igual al proyecto de Pages.
  - Sin ese archivo (y con el panel en blanco), Cloudflare publica la raíz del repo: `/` da 404 en blanco y quedan expuestos README, SQL y pruebas. Eso pasó en el primer despliegue.
  - La caché del borde de Cloudflare puede seguir sirviendo un rato rutas viejas en el alias de la rama: para verificar, usar la URL única del despliegue (`<hash>.messenger-estrellita-jampier-18.pages.dev`) o agregar `?algo` a la ruta.
  - `_headers`, `404.html` y `robots.txt` solo funcionan porque están en la raíz de lo publicado (`web/`).
- Back: **Supabase** (Auth correo+contraseña, Postgres con RLS, Realtime, Storage privado, Edge Function `enviar-push`).
- Llamadas de voz/video: **pendiente para la versión 2** (lo pidió así).

## Estado (6 nov 2026)

- Código completo y probado. **Pendiente:** llevar el PR jxenterprise/Messenger-love#1 a `main` (ahí se arregla la dirección principal), y que JX cree el proyecto Supabase (pasos 1–6 del README) y pegue URL + publishable key (+ VAPID pública) en `web/js/config.js`.
- JX no quiere un "bot": sin Supabase el sitio publicado muestra "Casi listo", nunca la pareja simulada (ver `FALTA_CONEXION` abajo).

## Preferencias de JX (respetarlas siempre)

- Todo en español: interfaz, comentarios, nombres de variables y funciones.
- Código comentado y fácil de seguir; zonas editables marcadas (✏️ en `web/js/config.js`).
- Imágenes entregadas en **WebP**. Excepción técnica: los íconos de la app (`web/img/*.png`) son PNG porque iPhone (apple-touch-icon) y el manifest lo exigen.
- Archivos entregables con nombres descriptivos y guiones bajos (ej. `Messenger_Estrellita_y_Jampier.zip`).
- Él prefiere que Claude proponga las ideas y mejoras ("dame lo mejor"), y que se le pregunte con formularios de opciones cuando hay decisiones.
- Verificar en la web la información técnica actual (Supabase y Cloudflare cambian seguido).
- Este archivo vive **escondido en `.claude/CLAUDE.md`** (Claude Code lo lee igual): JX pidió que en la raíz del repo solo se vea el README. No volver a crear `CLAUDE.md` en la raíz ni mencionarlo en el README.

## Estructura

```
.claude/CLAUDE.md         este archivo (escondido a pedido de JX)
.gitignore                artefactos de las pruebas (node_modules, capturas, .deno…)
wrangler.toml             Cloudflare Pages: publicar solo web/ (ver arriba)
web/                      ← lo único que publica Cloudflare Pages (Build output directory)
  index.html              pantallas: carga, conexión ("Casi listo"), entrada, chat, PIN
  css/styles.css          tokens claro (piel+lila) / oscuro (negro+rojo suave), componentes
  js/config.js            ✏️ URL + publishable key de Supabase + VAPID pública; abajo: limpieza de lo pegado,
                          CLAVE_PELIGROSA (sb_secret_/service_role → aviso rojo, no se usa), CONECTADA,
                          MODO_DEMO (solo __VISTA_PREVIA__, localhost/127.0.0.1 o ?demo, y nunca si está CONECTADA)
                          y FALTA_CONEXION (publicada sin datos → pantalla "Casi listo", sin backend)
  js/app.js               arranque, tema, sesión, PIN, ajustes, notificaciones, instalación, latido
  js/chat.js              chat: estado, render, bandeja offline, caché, gestos, grabación, búsqueda
  js/backend-supabase.js  única puerta a Supabase (misma interfaz que backend-demo.js)
  js/backend-demo.js      backend simulado para la vista previa (pareja que responde sola)
  js/interfaz.js          capas, avisos, confirmar, diálogos, hojas, visor de fotos, sonidos
  js/media.js             compresión a WebP (canvas o jSquash WASM en Safari), grabadora de voz
  js/candado.js           PIN (PBKDF2 150k, intentos), por usuario y dispositivo
  js/notificaciones.js    suscripción Web Push
  js/almacen.js           localStorage ('eyj:' prefijo) + IndexedDB (kv)
  js/iconos.js            íconos SVG (Lucide ISC + propios)
  js/vendor/              supabase-js 2.118.0 (UMD), jSquash WebP
  sw.js                   service worker: precache, caché de fotos, push, clic en aviso.
                          La página se guarda como './', nunca 'index.html': Cloudflare redirige
                          /index.html → / y una respuesta redirigida rompe abrir la app sin señal
  manifest.webmanifest    PWA + atajo "Te extraño" (?accion=te-extrano)
  _headers                CSP y cabeceras de seguridad de Cloudflare
supabase/01_estructura.sql           tablas, RLS, RPC, realtime, bucket (idempotente)
supabase/02_nueva_contrasena.sql     plantilla para restablecer contraseña
supabase/functions/enviar-push/index.ts   Web Push propio (RFC 8291 + VAPID RFC 8292)
herramientas/generar-claves-vapid.html    genera el par VAPID en el navegador
despertador/worker.js                Cloudflare Worker con cron: llama rpc/ping
desarrollo/                          pruebas automáticas y constructor de la vista previa
```

## Contrato de datos (SQL ↔ `backend-supabase.js` ↔ `backend-demo.js`)

Si cambias algo aquí, cambia los tres lugares.

- `perfiles(id, nombre, avatar_path, notif_con_texto, en_app, visto_en, …)` — el cliente solo puede actualizar `nombre`, `avatar_path`, `notif_con_texto`.
- `mensajes(id, client_id unique, remitente, tipo texto|imagen|audio|te_extrano, contenido, media_path, media_meta, responde_a, reacciones jsonb, editado_en, borrado, entregado_en, leido_en, notificado_en, creado_en, actualizado_en)` — el cliente solo inserta (`upsert … onConflict client_id, ignoreDuplicates`); todo lo demás va por RPC.
- RPC: `latido(p_en_app)`, `marcar_entregados()`, `marcar_leidos()`, `reaccionar(p_mensaje, p_emoji)`, `editar_mensaje(p_mensaje, p_texto)` (15 min), `borrar_mensaje(p_mensaje) → media_path`, `guardar_suscripcion(p_endpoint, p_p256dh, p_auth, p_dispositivo)`, `ping()`.
- `privado.es_miembro()` (security definer, esquema no expuesto) se usa en todas las políticas.
- Storage: bucket privado `media`, rutas `<uid>/<client_id>.<ext>` y `<uid>/avatar-<ts>.<ext>`; URLs firmadas de 6 h.
- Realtime: canal privado `pareja-eyj` (presence + broadcast `escribiendo`/`grabando`) con políticas en `realtime.messages`; `postgres_changes` de `mensajes`; si el canal privado falla por autorización, cae a `pareja-eyj-cambios` público.

## Invariantes (no romper)

- Máximo 2 cuentas: trigger `crear_perfil` en `auth.users`. `mensajes.remitente` es `on delete restrict` (no se puede borrar una cuenta con mensajes).
- El servidor fija `remitente`, fechas y estados al insertar (`preparar_mensaje`): el cliente no puede falsificarlos.
- Sincronización por `actualizado_en > última - 3 s` (trigger en cada update). Bandeja offline con `client_id` idempotente.
- Push: el cliente invoca `enviar-push` tras insertar; la función "reclama" `notificado_en` de forma atómica, no avisa si la pareja tiene la app abierta (latido < 40 s), descarta mensajes de más de 12 h, borra suscripciones 404/410 y libera el reclamo si todo falló por causas pasajeras. **Verify JWT apagado**: la función verifica la sesión con `auth.getUser(token)` y lee `SUPABASE_SECRET_KEYS` (o `SUPABASE_SERVICE_ROLE_KEY`).
- Avisos discretos por defecto ("E ❤ J · Tienes un mensaje nuevo 💌"); con `notif_con_texto` del destinatario muestran nombre y texto.
- Cada vez que cambie un archivo de `web/`: subir `VERSION` en `web/sw.js` y `CONFIG.VERSION`, y mantener la lista `ARCHIVOS_APP` de `sw.js` al día. Orígenes nuevos → actualizar la CSP de `_headers`.
- Vista previa (`window.__VISTA_PREVIA__`): sin service worker, sin historial, sin botón de guardar foto, banner "Vista previa".
- El sitio publicado nunca muestra la pareja simulada por defecto: sin Supabase → "Casi listo"; el demo solo con `?demo` (o en localhost para las pruebas).

## Pruebas (`desarrollo/`)

- `prueba_sql.py` — 86 pruebas de RLS/RPC contra PostgreSQL 16 local con `supabase_simulado.sql`.
- `prueba_funcion.mjs` (34 pruebas, Node) y `e2e_deno.mjs` (Deno real) — la Edge Function; descifra con `http_ece` y verifica la firma VAPID.
- `prueba_app.py`, `prueba_clave.py`, `prueba_bloqueo.py` — la app en Chrome (modo demo, sirviendo `web/` en 127.0.0.1), celular y PC, claro y oscuro.
- `prueba_conexion.py` (24 pruebas) — simula un dominio publicado (`eyj.prueba`): "Casi listo" sin datos, `?demo`, login con datos reales (config.js reemplazado al vuelo), aviso rojo con la clave secreta.
- `servidor_cloudflare.mjs` + `prueba_sin_senal.mjs` — servidor que imita las redirecciones de Cloudflare Pages y prueba que la app instalada abre sin señal.
- `construir_vista_previa.mjs` — genera el HTML único de la vista previa publicada como artifact.
Instrucciones en `desarrollo/LEEME_PRUEBAS.md`.

## Ideas para la versión 2

Llamadas (WebRTC con señalización por el canal Realtime privado + servidor TURN), contador de días juntos, álbum y "un día como hoy", mensajes programados, exportar la conversación, dominio propio.
