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

## Estado (10 nov 2026, v1.9)

- PR #1 ya está en `main`: la dirección .pages.dev muestra la app ("Casi listo"). La versión 1.1.0 (usuario + PIN) se subió directo a `main` a pedido de JX.
- El README tiene "Estado actual" arriba y una sección **Novedades** por versión: actualizarlas en cada entrega.
- Ingreso con usuario + PIN hecho y probado (versión 1.1.0). La carpeta local de JX (Windows) está conectada a GitHub con git (`origin/main`).
- **8 nov 2026 — Supabase conectado (versión 1.1.1):** proyecto `messenger-eyj` (ref `kcxhaducunhulfuiipfe`, sa-east-1, org JX Enterprise, plan Free). Cuentas con correos reales (`jampierdev@gmail.com`, `estrellitaperez2628@gmail.com`); como el usuario sale del correo, se puso a mano con SQL: `usuario` = `jampier` / `estrellita`. Registro cerrado, PIN puesto (JX no lo compartió: no pedirlo), secretos VAPID, funciones publicadas con Verify JWT apagado (verificado: responden con nuestros mensajes). Sin sesión: perfiles/mensajes/verificar_acceso dan 401.
- **8 nov 2026, 3:15 p. m. — v1.5:** ajustes y avisos que nunca se reinician (`perfiles.preferencias`), cámara (fotos < 5 MB), vaciar el chat para los dos, despertador en GitHub Actions (`.github/workflows/despertador.yml`, probado: el ping al proyecto real da 200 "ok").
- **8 nov 2026, ~3:10 p. m.:** JX ejecutó `01_estructura.sql` (salió "Listo ✅", 2 cuentas, PIN sí). Verificado con la clave publicable sin sesión: `rpc/vaciar_chat`, `chat_estado` y `perfiles` responden 42501 (existen y están protegidos). JX confirmó que vaciar funciona.
- **8 nov 2026, 3:25 p. m. — v1.6:** "Vaciar solo para mí" además de "para los dos". Sin SQL nuevo.
- **8 nov 2026, 3:45 p. m. — v1.7:** vista previa al compartir (Open Graph) con la foto especial de la pareja (`web/img/Justos/`, nombre de carpeta elegido por JX). `robots.txt` ahora deja entrar a los robots de vista previa y sigue bloqueando a buscadores y robots de IA.
- **8 nov 2026, 4:00 p. m. — v1.8:** la carpeta era "Juntos" (JX escribió "Justos" por error): renombrada a `web/img/Juntos/`, con `web/_redirects` (`/img/Justos/* → /img/Juntos/:splat 301`) para las tarjetas que ya guardaron la dirección vieja.
- **10 nov 2026, 7:55 a. m. — v1.9:** **Papelera** (`web/papelera/`, URL `/papelera`). "Eliminar para los dos" ya no destruye: marca `borrado`, guarda `borrado_en` y conserva texto y archivo. La papelera la ven LOS DOS (fue condición para hacerla: JX la pidió solo para él y se acordó la versión transparente).
- **Pendiente:** que JX vuelva a ejecutar `supabase/01_estructura.sql` (agrega `mensajes.borrado_en` y cambia `borrar_mensaje` a `returns void`). Sin eso, al eliminar da error de función. Lo eliminado antes de la v1.9 no se puede recuperar (el texto se destruía).
- El Python de JX (3.13) está dañado (falta `pickle`); instaló 3.15 (comando `py`). Ya no se usa Python en el proyecto.
- JX no quiere un "bot": sin Supabase el sitio publicado muestra "Casi listo", nunca la pareja simulada (ver `FALTA_CONEXION` abajo).

## Bitácora de sesiones (hora de Colombia, UTC-5)

Agregar una entrada al final de cada sesión, ANTES de publicar.

- **Vie 6 nov 2026, 11:15 a. m. → 12:15 p. m.** — JX subió el proyecto a GitHub y conectó Cloudflare Pages; la página daba 404. Diagnóstico: Cloudflare publicaba la raíz del repo. Arreglos: `wrangler.toml` (solo `web/`), pantalla "Casi listo" en vez del bot, service worker para abrir sin señal, aviso de clave secreta, `CLAUDE.md` escondido en `.claude/`. PR #1 fusionado → versión 1.0.1 publicada.
- **Sáb 7 nov 2026, ~12:00 a. m. → 1:30 a. m.** — Carpeta local de JX (Windows) conectada a GitHub con git. Ingreso con usuario + mismo PIN de 4 números (SQL, función `entrar-con-pin`, app, `03_pin.sql`). Las pruebas pasaron a Node (PGlite + Edge): 257 en total. Python de JX dañado → instaló 3.15. Versión 1.1.0 publicada en `main`.
- **Dom 8 nov 2026, ~12:30 a. m. → 1:10 a. m.** — Supabase configurado paso a paso con JX: proyecto `messenger-eyj`, SQL 01, cuentas con correos reales + usuarios puestos con SQL, registro cerrado, PIN, secretos VAPID, las 2 funciones (Verify JWT apagado, verificado con curl). App conectada (versión 1.1.1) y probada contra el proyecto real con un usuario inventado. La publicación quedó para que JX la autorice. **Siguiente:** que JX pruebe con el PIN real (2 ventanas en localhost:8080), instalar en los 2 celulares y activar avisos.
- **Dom 8 nov 2026, ~1:10 a. m. → 1:35 a. m.** — Documentación con fecha y hora (regla nueva de JX: documentar ANTES de publicar). El clasificador de permisos bloqueaba `git push`; JX agregó la regla `PowerShell(git push:*)` en `.claude/settings.local.json` (solo su PC) y desde ahí Claude sube con PowerShell. Se creó `.claude/settings.json` con permisos de solo lectura. Versión 1.1.1 publicada y comprobada en producción.
- **Dom 8 nov 2026, ~1:35 a. m. → 2:10 a. m.** — **v1.4.** JX pidió: (1) botones "Soy Jampier / Soy Estrellita" en vez de escribir el usuario; (2) versión visible bajo "Nuestro rincón privado" con numeración 1.0…1.50 → 2.0; (3) revisar "al revés" — no era un error de cuentas: arriba sale la pareja (como WhatsApp); se agregó saludo "Hola, X 💜 Estás hablando con Y" y placeholder "Escríbele a Y…"; (4) revisión completa con prioridad en SUS celulares: **Redmi Note 14 Pro+ (Jampier) y iPhone 12 Pro Max (Estrellita)**. Arreglados: fechas pegadas apiladas al deslizar, lluvia/avisos encima del PIN de bloqueo, foco inmediato del PIN (iOS abre el teclado). Pruebas nuevas de dispositivos (WebKit para el iPhone).

- **Dom 8 nov 2026, ~9:30 a. m. → 3:15 p. m.** — **v1.5.** JX reportó que al volver a entrar las notificaciones salían apagadas y pidió que "no se reinicie nada nunca". Causas: `forzarSalida` (cerrar sesión, PIN cambiado…) llamaba `desactivarNotificaciones`, y `asegurarSuscripcion` nunca corría al reabrir (se llamaba antes de `ctx.yo`). Solución: `perfiles.preferencias` jsonb (tema, fondo, sonido, bloqueo-seg, velocidad-audio, avisos) sincronizado con `guardarPreferencia`/`sincronizarPreferencias` en `app.js`; los avisos solo se apagan desde Ajustes; al entrar `revisarAvisos()` renueva la suscripción; cerrar sesión ya no borra nada (solo el PIN guardado). Además: botón de cámara (`capture="environment"`, solo táctil) y `comprimirImagen` con tope de 5 MB; menú ⋮ → "Borrar mensajes" (explica borrar uno + "Vaciar todo el chat" con doble confirmación, RPC `vaciar_chat` + tabla `chat_estado` en realtime); despertador en GitHub Actions (JX eligió eso; se re-activa solo por la regla de 60 días). Bug encontrado por las pruebas: dos capas seguidas cruzaban `history.back()` con `pushState` y la página quedaba en blanco → `abrirCapa` espera a que termine el "atrás" (`esperaHistorial`). 462 pruebas OK.
- **Dom 8 nov 2026, ~3:10 p. m. → 3:30 p. m.** — Al vaciar salía "Could not find the function public.vaciar_chat…": faltaba el SQL de la v1.5; se le explicó a JX dónde está el archivo y para qué sirve, lo ejecutó y quedó verificado. JX notó que vaciar borra para los dos (era lo pedido) y eligió **tener las dos opciones** → **v1.6**: "Vaciar solo para mí" guarda un corte (`oculto-hasta` en `perfiles.preferencias`, local `eyj:oculto:<uid>`) = `creado_en` del último mensaje recibido (hora del servidor, no del celular). Nada se borra de la nube. 469 pruebas OK. JX cerró el día: "todo funciona".
- **Dom 8 nov 2026, ~3:30 p. m. → 3:50 p. m.** — **v1.7.** JX pidió que al compartir el enlace saliera una foto especial (un muñeco de crochet de los dos), en una carpeta llamada "Justos". En Telegram salía solo el dominio por dos causas: no había etiquetas Open Graph y `robots.txt` (`User-agent: * / Disallow: /`) bloqueaba también a los robots de vista previa. Hecho: foto original → `web/img/Justos/Estrellita_y_Jampier.webp`; `desarrollo/generar_imagen_redes.mjs` (Playwright) arma `Estrellita_y_Jampier_redes.jpg` 1200×630 (foto completa centrada + fondo difuminado + corazones de la app; JPEG ≤ 250 KB, 146 KB); etiquetas og:/twitter: absolutas en `index.html`; `robots.txt` con un grupo por robot de vista previa (`Disallow:` vacío) y `*` → `Disallow: /`; prueba nueva `prueba_redes.mjs` (39). 507 pruebas OK. Se lanzó un workflow de investigación (3 investigadores + verificador) sobre formatos, límites y robots; se publicó sin esperarlo porque JX quería terminar (la lista de robots permitidos es un superconjunto inofensivo).
- **Dom 8 nov 2026, ~3:50 p. m. → 4:05 p. m.** — **v1.8.** JX aclaró que la carpeta era "Juntos" (no "Justos"). `git mv web/img/Justos web/img/Juntos`; actualizados `index.html` (og:image, og:image:secure_url, twitter:image), `robots.txt` (comentario), generador, `prueba_redes.mjs` (40: +1 revisa la redirección), README, LEEME y esta guía; la historia de la v1.7 se dejó como fue. Nuevo `web/_redirects` con un 301 de la ruta vieja a la nueva. El generador re-hizo la imagen idéntica byte a byte. 508 pruebas OK.
- **Mar 10 nov 2026, ~7:30 a. m. → 8:15 a. m.** — **v1.9.** JX pidió una página aparte en el mismo dominio, "solo para mí", para ver lo que se elimina del chat y "chismosear" lo que borra ella. Se le explicó que una página secreta donde solo uno lee lo que el otro eliminó rompe el "eliminar para los dos" sin que ella lo sepa, y se le ofrecieron variantes honestas con formulario; **eligió "Papelera para los dos"**. Hecho: `mensajes.borrado_en` + `borrar_mensaje` que guarda en vez de destruir (ya no devuelve ruta: `returns void`, hubo que `drop function`); `cargarBorrados()` en los dos backends; página `web/papelera/` (index.html + papelera.css + papelera.js) con PIN, filtros y agrupado por día de borrado; entradas en el menú ⋮ y en Ajustes; el diálogo de eliminar ahora avisa que queda en la Papelera. `cargarScript` de supabase-js pasó a `new URL(..., import.meta.url)` porque la ruta relativa `js/vendor/...` se rompía desde /papelera. Dos mensajes eliminados de ejemplo en el demo. Más de 560 pruebas OK. Una prueba de celulares falló por medir a media animación: `revisar()` ahora espera a que terminen (document.getAnimations). El workflow de revisión se quedó sin cupo (los 3 revisores fallaron: su "sin hallazgos" NO vale), así que la revisión se hizo a mano y salieron 3 arreglos: (1) el precache de la papelera salió de ARCHIVOS_APP a ARCHIVOS_EXTRA con Promise.allSettled, porque un fallo en cache.addAll dejaba la app ENTERA sin instalar; (2) `chat.irAPapelera()` guarda el borrador (se guardaba con 500 ms de retraso) y corta la grabación antes de navegar; (3) try/catch al comprobar el PIN (PBKDF2 necesita https). Verificado a mano: escaparHtml cubre comillas, buscar() ya filtra borrado=false, la burbuja nunca pinta el contenido de un eliminado, y borrarMedia ya no se llama al eliminar.

## Preferencias de JX (respetarlas siempre)

- **Prioridad de diseño: los celulares de la pareja — Redmi Note 14 Pro+ (Jampier, Chrome, ≈407×904) y iPhone 12 Pro Max (Estrellita, Safari, 428×926, notch 47 / barra 34).** Después PC y demás. Probar siempre con `npm run prueba:celulares` (WebKit: `npm run instalar:safari`).
- **Versión visible y numeración:** `CONFIG.VERSION` = '1.N' (se muestra "v1.N" bajo "Nuestro rincón privado"), de 1.0 a 1.50 y luego 2.0. Subirla en cada entrega junto con `VERSION` de `web/sw.js` ('eyj-v1.N'). Equivalencias viejas: 1.0.0=v1.0, 1.0.1=v1.1, 1.1.0=v1.2, 1.1.1=v1.3.
- **Antes de publicar (push a GitHub), documentar TODO lo nuevo con fecha y hora:** Novedades y "Estado actual" del README, y la bitácora de arriba. Lo pidió explícitamente el 8 nov 2026.

- Todo en español: interfaz, comentarios, nombres de variables y funciones.
- Código comentado y fácil de seguir; zonas editables marcadas (✏️ en `web/js/config.js`).
- Imágenes entregadas en **WebP**. Excepciones técnicas: los íconos de la app (`web/img/*.png`) son PNG porque iPhone (apple-touch-icon) y el manifest lo exigen, y la imagen para compartir (`web/img/Juntos/Estrellita_y_Jampier_redes.jpg`) es JPEG porque es el único formato que todas las redes muestran en la vista previa.
- Archivos entregables con nombres descriptivos y guiones bajos (ej. `Messenger_Estrellita_y_Jampier.zip`).
- Él prefiere que Claude proponga las ideas y mejoras ("dame lo mejor"), y que se le pregunte con formularios de opciones cuando hay decisiones.
- Verificar en la web la información técnica actual (Supabase y Cloudflare cambian seguido).
- Este archivo vive **escondido en `.claude/CLAUDE.md`** (Claude Code lo lee igual): JX pidió que en la raíz del repo solo se vea el README. No volver a crear `CLAUDE.md` en la raíz ni mencionarlo en el README.

## Estructura

```
.claude/CLAUDE.md         este archivo (escondido a pedido de JX)
.gitignore                artefactos de las pruebas (node_modules, capturas, .deno…)
.github/workflows/despertador.yml  despertador: cron 2 veces al día → POST rpc/ping con la URL y la clave
                          publicable que lee de web/js/config.js; se re-activa solo (gh workflow enable)
wrangler.toml             Cloudflare Pages: publicar solo web/ (ver arriba)
web/                      ← lo único que publica Cloudflare Pages (Build output directory)
  index.html              pantallas: carga, conexión ("Casi listo"), entrada en 2 pasos ("¿Quién eres?" con botones
                          de CONFIG.PERSONAS → solo PIN; #usuario es un input oculto), chat, PIN de bloqueo
  css/styles.css          tokens claro (piel+lila) / oscuro (negro+rojo suave), componentes
  js/config.js            ✏️ URL + publishable key de Supabase + VAPID pública; abajo: limpieza de lo pegado,
                          CLAVE_PELIGROSA (sb_secret_/service_role → aviso rojo, no se usa), CONECTADA,
                          MODO_DEMO (solo __VISTA_PREVIA__, localhost/127.0.0.1 o ?demo, y nunca si está CONECTADA)
                          y FALTA_CONEXION (publicada sin datos → pantalla "Casi listo", sin backend)
  js/app.js               arranque, tema, sesión, PIN, ajustes (guardarPreferencia → perfiles.preferencias),
                          notificaciones (revisarAvisos al entrar), instalación, latido
  js/chat.js              chat: estado, render, bandeja offline, caché, gestos, grabación, búsqueda, cámara,
                          "Borrar mensajes" / vaciar el chat (aplicarVaciado, revisarVaciado)
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
  robots.txt              buscadores y robots de IA fuera; robots de vista previa (TelegramBot, facebookexternalhit,
                          Facebot, WhatsApp, Twitterbot, LinkedInBot, Slackbot, Discordbot…) adentro, un grupo por robot
  _redirects              301 de /img/Justos/* → /img/Juntos/:splat (la carpeta se llamó "Justos" solo en la v1.7)
  papelera/               LA PAPELERA (URL /papelera): index.html + papelera.css + papelera.js.
                          Página aparte con los mensajes eliminados; la ven LOS DOS. Usa los mismos
                          tokens de css/styles.css y los backends del chat (cargarBorrados).
  img/Juntos/             foto especial de la pareja (Estrellita_y_Jampier.webp, original vertical) y la imagen
                          Open Graph Estrellita_y_Jampier_redes.jpg (1200×630, la arma desarrollo/generar_imagen_redes.mjs)
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

- `perfiles(id, nombre, avatar_path, notif_con_texto, preferencias, en_app, visto_en, …)` — el cliente solo puede actualizar `nombre`, `avatar_path`, `notif_con_texto`, `preferencias` (jsonb objeto ≤ 2000 bytes; claves: `tema`, `fondo`, `sonido`, `bloqueo-seg`, `velocidad-audio`, `avisos` = las mismas de localStorage `eyj:`). `avisos`: true/false/ausente (ausente = nunca eligió). La foto de fondo vive solo en el celular (kv `fondo-foto`).
- `chat_estado(id=true, vaciado_en, vaciado_por)` — una fila, solo lectura para los miembros, en la publicación realtime. `vaciar_chat() → text[]` (rutas de media para borrar del Storage; borra todos los mensajes). Política de Storage "borrar archivos que ya nadie usa" (`privado.archivo_en_uso`). Backends: `vaciarChat()`, `estadoChat() → {vaciadoEn, vaciadoPor}`, callback `onChatVaciado(vaciadoEn, vaciadoPor)`. El cliente guarda `eyj:vaciado:<uid>` y filtra la caché con eso.
- "Vaciar solo para mí" (v1.6): `preferencias['oculto-hasta']` (ISO) ↔ local `eyj:oculto:<uid>` (por persona, NO está en `CLAVES_PREFERENCIAS`; lo agrega `preferenciasLocales()` y lo aplica `sincronizarPreferencias` con `chat.ocultarHasta(iso, {desdeNube})`). En `chat.js`, `estado.corte` = máx(vaciado, oculto) y `quedoOculto()` filtra en `aplicarSilencioso`, `alRecibirMensaje`, carga inicial/antiguos (corta `hayMasAntiguos`) y búsqueda; `quitarHastaCorte()` limpia la pantalla y la caché.
- `mensajes(id, client_id unique, remitente, tipo texto|imagen|audio|te_extrano, contenido, media_path, media_meta, responde_a, reacciones jsonb, editado_en, borrado, borrado_en, entregado_en, leido_en, notificado_en, creado_en, actualizado_en)` — el cliente solo inserta (`upsert … onConflict client_id, ignoreDuplicates`); todo lo demás va por RPC.
- `perfiles.usuario` (solo lectura para la app). RPC del ingreso: `verificar_acceso(p_usuario, p_pin) → jsonb` (solo service_role), `cambiar_pin(p_actual, p_nuevo) → jsonb {ok, version | motivo}`, `version_pin() → int`. Motivos: `datos` (con `restantes`), `esperar` (con `segundos`), `bloqueado`, `sin-pin`.
- Backends (`backend-supabase.js` y `backend-demo.js`): `entrar(usuario, pin) → {usuario, version}`, `cambiarPin(actual, nuevo) → version`, `versionPin()`; el demo además `pinDemo()` (1234, se muestra en #pin-demo).
- `CONFIG.PERSONAS` = `[{usuario, nombre}]` en `web/js/config.js`: los botones "Soy …". `usuario` debe ser igual a `perfiles.usuario` (la app no puede leer perfiles sin sesión, por eso van en config). Hoy: jampier / estrellita.
- **Papelera (v1.9):** `borrar_mensaje(p_mensaje)` **returns void** (antes `text` con la ruta: se hizo `drop function`) y ya NO pone en null `contenido`/`media_path`/`media_meta`/`reacciones`: solo `borrado = true, borrado_en = now()`, y solo sobre mensajes propios. El archivo del Storage NO se borra (lo protege `privado.archivo_en_uso`). Backends: `cargarBorrados({limite})` → mensajes con `borrado` ordenados por `borrado_en desc`. La página `/papelera` los muestra a los DOS; `vaciar_chat()` sí borra todo, papelera incluida.
- RPC: `latido(p_en_app)`, `marcar_entregados()`, `marcar_leidos()`, `reaccionar(p_mensaje, p_emoji)`, `editar_mensaje(p_mensaje, p_texto)` (15 min), `borrar_mensaje(p_mensaje) → media_path`, `guardar_suscripcion(p_endpoint, p_p256dh, p_auth, p_dispositivo)`, `ping()`.
- `privado.es_miembro()` (security definer, esquema no expuesto) se usa en todas las políticas.
- Storage: bucket privado `media`, rutas `<uid>/<client_id>.<ext>` y `<uid>/avatar-<ts>.<ext>`; URLs firmadas de 6 h.
- Realtime: canal privado `pareja-eyj` (presence + broadcast `escribiendo`/`grabando`) con políticas en `realtime.messages`; `postgres_changes` de `mensajes`; si el canal privado falla por autorización, cae a `pareja-eyj-cambios` público.

## Invariantes (no romper)

- La Papelera es de LOS DOS: nunca convertirla en una página que solo vea una persona, ni esconder que lo eliminado queda guardado. El aviso al eliminar y el texto de Ajustes son parte del trato.
- Vista previa al compartir: las URLs de `og:url`, `og:image`, `og:image:secure_url` y `twitter:image` son ABSOLUTAS y usan el dominio de Pages (`<name de wrangler.toml>.pages.dev`). Si cambia el dominio, cambiarlas. `robots.txt` nunca pierde el grupo `User-agent: *` + `Disallow: /` (privacidad), y los robots de vista previa conservan su propio grupo. El `noindex` (meta + `X-Robots-Tag`) se queda.

- Máximo 2 cuentas: trigger `crear_perfil` en `auth.users`. `mensajes.remitente` es `on delete restrict` (no se puede borrar una cuenta con mensajes).
- El servidor fija `remitente`, fechas y estados al insertar (`preparar_mensaje`): el cliente no puede falsificarlos.
- Sincronización por `actualizado_en > última - 3 s` (trigger en cada update). Bandeja offline con `client_id` idempotente.
- Push: el cliente invoca `enviar-push` tras insertar; la función "reclama" `notificado_en` de forma atómica, no avisa si la pareja tiene la app abierta (latido < 40 s), descarta mensajes de más de 12 h, borra suscripciones 404/410 y libera el reclamo si todo falló por causas pasajeras. **Verify JWT apagado**: la función verifica la sesión con `auth.getUser(token)` y lee `SUPABASE_SECRET_KEYS` (o `SUPABASE_SERVICE_ROLE_KEY`).
- Avisos discretos por defecto ("E ❤ J · Tienes un mensaje nuevo 💌"); con `notif_con_texto` del destinatario muestran nombre y texto.
- Los ajustes nunca se pierden: cerrar sesión / PIN cambiado / muchos intentos (`forzarSalida`) NO desuscribe los avisos ni borra caché, borrador, bandeja ni ajustes; solo `borrarPin` y la versión del PIN. Los avisos solo se apagan con el interruptor de Ajustes (`avisos: false`).
- Cada vez que cambie un archivo de `web/`: subir `VERSION` en `web/sw.js` y `CONFIG.VERSION`, y mantener la lista `ARCHIVOS_APP` de `sw.js` al día. Orígenes nuevos → actualizar la CSP de `_headers`.
- Vista previa (`window.__VISTA_PREVIA__`): sin service worker, sin historial, sin botón de guardar foto, banner "Vista previa".
- El sitio publicado nunca muestra la pareja simulada por defecto: sin Supabase → "Casi listo"; el demo solo con `?demo` (o en localhost para las pruebas).

## Pruebas (`desarrollo/`) — todo en Node, `npm test` corre todo

- `prueba_sql.mjs` — 174 pruebas de RLS/RPC/PIN con **PGlite** (PostgreSQL en Node, sin instalar nada) y `supabase_simulado.sql`. Reemplazó a `prueba_sql.py`.
- `prueba_entrar.mjs` (23) — `entrar-con-pin` empaquetada con esbuild + supabase-js real; `verificar_acceso` responde PGlite.
- `prueba_funcion.mjs` (34) y `e2e_deno.mjs` (Deno real) — `enviar-push`; descifra con `http_ece` y verifica VAPID.
- `prueba_pantallas.mjs` (90: 10 tamaños × pantallas) y `prueba_celulares.mjs` (70+: Redmi Note 14 Pro+ y iPhone 12 Pro Max con WebKit, notch/barra simulados con `--seguro-arriba/abajo`). `cerrarSorpresas()` en `apoyo_navegador.mjs` cierra el "Te extraño" sorpresa del demo (~26 s) si aparece. WebKit en Windows no aplica pesos de la fuente variable Nunito (negritas se ven delgadas solo en la prueba; el iPhone real sí).
- `prueba_ingreso.mjs` (59) y `prueba_app.mjs` (32) — navegador (Edge por defecto, `apoyo_navegador.mjs`): ingreso, bloqueo, cambio de PIN, app conectada a un Supabase imitado (dominio `eyj.prueba` + `--unsafely-treat-insecure-origin-as-secure` porque PBKDF2 necesita contexto seguro), "Casi listo", clave secreta, y la app completa en demo. Reemplazaron a los `.py`.
- `prueba_sin_senal.mjs` + `servidor_cloudflare.mjs` — abrir sin señal con las redirecciones de Cloudflare. `npm run ver` sirve `web/` en http://localhost:8080.
- `prueba_generador.mjs` — generador de claves VAPID.
- `prueba_papelera.mjs` (39) — la Papelera en el navegador: se ve lo eliminado y el chat no lo muestra, el aviso al eliminar, que la ven los dos, sin sesión no muestra nada, el PIN protege, filtros y computador. Lo que no puede probar el demo (que lo eliminado AHORA quede guardado) lo cubre la sección 19 de `prueba_sql.mjs`, porque el demo no guarda nada y al cambiar de página vuelve a los ejemplos.
- `prueba_redes.mjs` (40) — vista previa al compartir: etiquetas og:/twitter: absolutas y con el dominio de `wrangler.toml`, imagen JPEG 1200×630 ≤ 300 KB, `robots.txt` evaluado como RFC 9309 (buscadores fuera, robots de vista previa adentro) y la portada/imagen servidas por `servidor_cloudflare.mjs` a cada robot. `npm run imagen:redes` rehace la imagen (`-- --original "ruta"` para cambiar la foto).
- En Windows los archivos están con CRLF (core.autocrlf=true); usar `fileURLToPath`/`pathToFileURL`, nunca `URL.pathname`, para rutas.
Instrucciones en `desarrollo/LEEME_PRUEBAS.md`.

## Ideas para la versión 2

Llamadas (WebRTC con señalización por el canal Realtime privado + servidor TURN), contador de días juntos, álbum y "un día como hoy", mensajes programados, exportar la conversación, dominio propio.
