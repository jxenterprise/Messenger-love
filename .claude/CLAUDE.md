# CLAUDE.md — Messenger Estrellita y Jampier ❤️

Contexto para retomar este proyecto en otra sesión. Léelo completo antes de tocar código.

## Qué es

Chat privado (PWA) para exactamente **2 personas**: Jampier (JX, dueño del proyecto) y Estrellita, su novia. Proyecto **personal**: no lleva el crédito "Diseño y desarrollo: JX Company". Nombre: "Messenger Estrellita y Jampier ❤️"; nombre corto en el ícono: "E ❤ J".

- Front: HTML + CSS + JS (módulos ES, sin framework ni build) en `web/`, publicado en Cloudflare Pages **conectado al repo de GitHub** `jxenterprise/Messenger-love` (público). Rama `main` = producción: cada push a `main` publica solo; las demás ramas generan vistas previas. Proyecto: `messenger-estrellita-jampier-18.pages.dev`.
  - **`wrangler.toml` en la raíz** (`name = "messenger-estrellita-jampier-18"`, `pages_build_output_dir = "web"`) fija qué se publica; es la fuente de verdad y el campo del panel queda bloqueado. Verificado el 6 nov 2026 en una vista previa: `/` 200 con la app y `_headers` aplicadas; README, SQL, `.claude/` y `wrangler.toml` dan 404. `name` debe ser igual al proyecto de Pages.
  - Sin ese archivo (y con el panel en blanco), Cloudflare publica la raíz del repo: `/` da 404 en blanco y quedan expuestos README, SQL y pruebas. Eso pasó en el primer despliegue.
  - La caché del borde de Cloudflare puede seguir sirviendo un rato rutas viejas en el alias de la rama: para verificar, usar la URL única del despliegue (`<hash>.messenger-estrellita-jampier-18.pages.dev`) o agregar `?algo` a la ruta.
  - `_headers`, `404.html` y `robots.txt` solo funcionan porque están en la raíz de lo publicado (`web/`).
- Back: **Supabase** (Auth, Postgres con RLS, Realtime, Storage privado, Edge Functions `entrar-con-pin` y `enviar-push`).
- **Ingreso (pedido de JX, 7 nov 2026): usuario + el MISMO PIN de 4 números para los dos.** No hay contraseñas en la app.
  - `perfiles.usuario` sale del correo de la cuenta (`tucorreo+jampier@gmail.com` → `jampier`; sin `+`, lo de antes de la @). La app no puede cambiarlo.
  - El PIN vive cifrado (bcrypt) en `privado.acceso_pin` (una fila, con `version`). Intentos en `privado.acceso_intentos`: 5 fallos seguidos → 15 min de espera; 15 → bloqueada hasta `privado.desbloquear()` o `privado.poner_pin()` (plantilla `supabase/03_pin.sql`). PINs fáciles rechazados (`privado.pin_debil`).
  - Flujo: la app llama `entrar-con-pin` → `verificar_acceso` (solo service_role) → `auth.admin.generateLink({type:'magiclink'})` (no envía correo) → devuelve `properties.hashed_token` → la app hace `verifyOtp({token_hash, type:'email'})`. Verify JWT apagado.
  - Al entrar, la app guarda el PIN cifrado (PBKDF2, `candado.js`) para el bloqueo automático sin señal, y la `version` del PIN; si `version_pin()` cambia (el otro lo cambió), fuerza entrar de nuevo.
  - `cambiar_pin(actual, nuevo)` devuelve jsonb y NO lanza error con el PIN actual equivocado: un error desharía el conteo de intentos (bug encontrado por las pruebas).
  - Riesgo aceptado: cualquiera que sepa el PIN y un usuario entra como esa persona (los dos comparten PIN, así lo quiso JX). Un atacante puede bloquear las cuentas a propósito (15 fallos); las sesiones abiertas no se caen.
- Llamadas de voz/video: **pendiente para la versión 2** (lo pidió así).

## Estado (7 nov 2026)

- PR #1 ya está en `main`: la dirección .pages.dev muestra la app ("Casi listo"). La versión 1.1.0 (usuario + PIN) se subió directo a `main` a pedido de JX.
- El README tiene "Estado actual" arriba y una sección **Novedades** por versión: actualizarlas en cada entrega.
- Ingreso con usuario + PIN hecho y probado (versión 1.1.0). La carpeta local de JX (Windows) está conectada a GitHub con git (`origin/main`).
- **8 nov 2026 — Supabase conectado (versión 1.1.1):** proyecto `messenger-eyj` (ref `kcxhaducunhulfuiipfe`, sa-east-1, org JX Enterprise, plan Free). Cuentas con correos reales (`jampierdev@gmail.com`, `estrellitaperez2628@gmail.com`); como el usuario sale del correo, se puso a mano con SQL: `usuario` = `jampier` / `estrellita`. Registro cerrado, PIN puesto (JX no lo compartió: no pedirlo), secretos VAPID, funciones publicadas con Verify JWT apagado (verificado: responden con nuestros mensajes). Sin sesión: perfiles/mensajes/verificar_acceso dan 401.
- **Pendiente:** prueba real entre los dos (JX tiene el PIN), instalar en los celulares y activar avisos; despertador (paso 8) opcional.
- El Python de JX (3.13) está dañado (falta `pickle`); instaló 3.15 (comando `py`). Ya no se usa Python en el proyecto.
- JX no quiere un "bot": sin Supabase el sitio publicado muestra "Casi listo", nunca la pareja simulada (ver `FALTA_CONEXION` abajo).

## Bitácora de sesiones (hora de Colombia, UTC-5)

Agregar una entrada al final de cada sesión, ANTES de publicar.

- **Vie 6 nov 2026, 11:15 a. m. → 12:15 p. m.** — JX subió el proyecto a GitHub y conectó Cloudflare Pages; la página daba 404. Diagnóstico: Cloudflare publicaba la raíz del repo. Arreglos: `wrangler.toml` (solo `web/`), pantalla "Casi listo" en vez del bot, service worker para abrir sin señal, aviso de clave secreta, `CLAUDE.md` escondido en `.claude/`. PR #1 fusionado → versión 1.0.1 publicada.
- **Sáb 7 nov 2026, ~12:00 a. m. → 1:30 a. m.** — Carpeta local de JX (Windows) conectada a GitHub con git. Ingreso con usuario + mismo PIN de 4 números (SQL, función `entrar-con-pin`, app, `03_pin.sql`). Las pruebas pasaron a Node (PGlite + Edge): 257 en total. Python de JX dañado → instaló 3.15. Versión 1.1.0 publicada en `main`.
- **Dom 8 nov 2026, ~12:30 a. m. → 1:10 a. m.** — Supabase configurado paso a paso con JX: proyecto `messenger-eyj`, SQL 01, cuentas con correos reales + usuarios puestos con SQL, registro cerrado, PIN, secretos VAPID, las 2 funciones (Verify JWT apagado, verificado con curl). App conectada (versión 1.1.1) y probada contra el proyecto real con un usuario inventado. La publicación quedó para que JX la autorice. **Siguiente:** que JX pruebe con el PIN real (2 ventanas en localhost:8080), instalar en los 2 celulares y activar avisos.
- **Dom 8 nov 2026, ~1:10 a. m. → 1:35 a. m.** — Documentación con fecha y hora (regla nueva de JX: documentar ANTES de publicar). El clasificador de permisos bloqueaba `git push`; JX agregó la regla `PowerShell(git push:*)` en `.claude/settings.local.json` (solo su PC) y desde ahí Claude sube con PowerShell. Se creó `.claude/settings.json` con permisos de solo lectura. Versión 1.1.1 publicada y comprobada en producción.
- **Dom 8 nov 2026, ~1:35 a. m. → 2:10 a. m.** — **v1.4.** JX pidió: (1) botones "Soy Jampier / Soy Estrellita" en vez de escribir el usuario; (2) versión visible bajo "Nuestro rincón privado" con numeración 1.0…1.50 → 2.0; (3) revisar "al revés" — no era un error de cuentas: arriba sale la pareja (como WhatsApp); se agregó saludo "Hola, X 💜 Estás hablando con Y" y placeholder "Escríbele a Y…"; (4) revisión completa con prioridad en SUS celulares: **Redmi Note 14 Pro+ (Jampier) y iPhone 12 Pro Max (Estrellita)**. Arreglados: fechas pegadas apiladas al deslizar, lluvia/avisos encima del PIN de bloqueo, foco inmediato del PIN (iOS abre el teclado). Pruebas nuevas de dispositivos (WebKit para el iPhone).

## Preferencias de JX (respetarlas siempre)

- **Prioridad de diseño: los celulares de la pareja — Redmi Note 14 Pro+ (Jampier, Chrome, ≈407×904) y iPhone 12 Pro Max (Estrellita, Safari, 428×926, notch 47 / barra 34).** Después PC y demás. Probar siempre con `npm run prueba:celulares` (WebKit: `npm run instalar:safari`).
- **Versión visible y numeración:** `CONFIG.VERSION` = '1.N' (se muestra "v1.N" bajo "Nuestro rincón privado"), de 1.0 a 1.50 y luego 2.0. Subirla en cada entrega junto con `VERSION` de `web/sw.js` ('eyj-v1.N'). Equivalencias viejas: 1.0.0=v1.0, 1.0.1=v1.1, 1.1.0=v1.2, 1.1.1=v1.3.
- **Antes de publicar (push a GitHub), documentar TODO lo nuevo con fecha y hora:** Novedades y "Estado actual" del README, y la bitácora de arriba. Lo pidió explícitamente el 8 nov 2026.

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
  index.html              pantallas: carga, conexión ("Casi listo"), entrada en 2 pasos ("¿Quién eres?" con botones
                          de CONFIG.PERSONAS → solo PIN; #usuario es un input oculto), chat, PIN de bloqueo
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
supabase/02_nueva_contrasena.sql     plantilla de emergencia para la contraseña interna de una cuenta
supabase/03_pin.sql                  ✏️ poner el PIN de los dos / desbloquear
supabase/functions/entrar-con-pin/index.ts  usuario + PIN → pase de un solo uso (magiclink hashed_token)
supabase/functions/enviar-push/index.ts   Web Push propio (RFC 8291 + VAPID RFC 8292)
herramientas/generar-claves-vapid.html    genera el par VAPID en el navegador
despertador/worker.js                Cloudflare Worker con cron: llama rpc/ping
desarrollo/                          pruebas automáticas y constructor de la vista previa
```

## Contrato de datos (SQL ↔ `backend-supabase.js` ↔ `backend-demo.js`)

Si cambias algo aquí, cambia los tres lugares.

- `perfiles(id, nombre, avatar_path, notif_con_texto, en_app, visto_en, …)` — el cliente solo puede actualizar `nombre`, `avatar_path`, `notif_con_texto`.
- `mensajes(id, client_id unique, remitente, tipo texto|imagen|audio|te_extrano, contenido, media_path, media_meta, responde_a, reacciones jsonb, editado_en, borrado, entregado_en, leido_en, notificado_en, creado_en, actualizado_en)` — el cliente solo inserta (`upsert … onConflict client_id, ignoreDuplicates`); todo lo demás va por RPC.
- `perfiles.usuario` (solo lectura para la app). RPC del ingreso: `verificar_acceso(p_usuario, p_pin) → jsonb` (solo service_role), `cambiar_pin(p_actual, p_nuevo) → jsonb {ok, version | motivo}`, `version_pin() → int`. Motivos: `datos` (con `restantes`), `esperar` (con `segundos`), `bloqueado`, `sin-pin`.
- Backends (`backend-supabase.js` y `backend-demo.js`): `entrar(usuario, pin) → {usuario, version}`, `cambiarPin(actual, nuevo) → version`, `versionPin()`; el demo además `pinDemo()` (1234, se muestra en #pin-demo).
- `CONFIG.PERSONAS` = `[{usuario, nombre}]` en `web/js/config.js`: los botones "Soy …". `usuario` debe ser igual a `perfiles.usuario` (la app no puede leer perfiles sin sesión, por eso van en config). Hoy: jampier / estrellita.
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

## Pruebas (`desarrollo/`) — todo en Node, `npm test` corre todo

- `prueba_sql.mjs` — 136 pruebas de RLS/RPC/PIN con **PGlite** (PostgreSQL en Node, sin instalar nada) y `supabase_simulado.sql`. Reemplazó a `prueba_sql.py`.
- `prueba_entrar.mjs` (23) — `entrar-con-pin` empaquetada con esbuild + supabase-js real; `verificar_acceso` responde PGlite.
- `prueba_funcion.mjs` (34) y `e2e_deno.mjs` (Deno real) — `enviar-push`; descifra con `http_ece` y verifica VAPID.
- `prueba_pantallas.mjs` (90: 10 tamaños × pantallas) y `prueba_celulares.mjs` (70+: Redmi Note 14 Pro+ y iPhone 12 Pro Max con WebKit, notch/barra simulados con `--seguro-arriba/abajo`). `cerrarSorpresas()` en `apoyo_navegador.mjs` cierra el "Te extraño" sorpresa del demo (~26 s) si aparece. WebKit en Windows no aplica pesos de la fuente variable Nunito (negritas se ven delgadas solo en la prueba; el iPhone real sí).
- `prueba_ingreso.mjs` (49) y `prueba_app.mjs` (18) — navegador (Edge por defecto, `apoyo_navegador.mjs`): ingreso, bloqueo, cambio de PIN, app conectada a un Supabase imitado (dominio `eyj.prueba` + `--unsafely-treat-insecure-origin-as-secure` porque PBKDF2 necesita contexto seguro), "Casi listo", clave secreta, y la app completa en demo. Reemplazaron a los `.py`.
- `prueba_sin_senal.mjs` + `servidor_cloudflare.mjs` — abrir sin señal con las redirecciones de Cloudflare. `npm run ver` sirve `web/` en http://localhost:8080.
- `prueba_generador.mjs` — generador de claves VAPID.
- En Windows los archivos están con CRLF (core.autocrlf=true); usar `fileURLToPath`/`pathToFileURL`, nunca `URL.pathname`, para rutas.
Instrucciones en `desarrollo/LEEME_PRUEBAS.md`.

## Ideas para la versión 2

Llamadas (WebRTC con señalización por el canal Realtime privado + servidor TURN), contador de días juntos, álbum y "un día como hoy", mensajes programados, exportar la conversación, dominio propio.
