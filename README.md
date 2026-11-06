# Messenger Estrellita y Jampier ❤️

Un chat privado solo para ustedes dos: mensajes al instante, fotos, notas de voz, "Te extraño", notificaciones y PIN. Es una web (HTML, CSS y JS) que se instala en el celular como una app, en Android, iPhone y computador.

Todo funciona con planes **gratis**: Supabase (la base de datos y el tiempo real) y Cloudflare Pages (la página, en una dirección `.pages.dev`).

> Tiempo total la primera vez: unos 40 minutos, con calma. Haz los pasos en orden y no te saltes ninguno.

---

## Qué hay en esta carpeta

| Carpeta / archivo | Para qué sirve |
|---|---|
| `web/` | **La app.** Esta carpeta (y solo esta) es la que se sube a Cloudflare. |
| `web/js/config.js` | ✏️ El único archivo que tienes que editar: aquí van tus datos de Supabase. |
| `supabase/01_estructura.sql` | Crea la base de datos y todas las reglas de seguridad. |
| `supabase/02_nueva_contrasena.sql` | Plantilla por si alguno olvida su contraseña. |
| `supabase/functions/enviar-push/index.ts` | La función que manda las notificaciones. |
| `herramientas/generar-claves-vapid.html` | Crea las claves de las notificaciones (se abre con doble clic). |
| `despertador/worker.js` | Evita que Supabase "duerma" el proyecto si pasan una semana sin escribirse. |
| `desarrollo/` | Pruebas automáticas (no se sube a ningún lado). |
| `CLAUDE.md` | Contexto técnico, para retomar el proyecto con Claude más adelante. |

---

## Paso 1 · Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) → **Sign in** (puedes entrar con GitHub o con correo).
2. **New project**:
   - **Name:** `messenger-eyj`
   - **Database Password:** toca **Generate a password** y guárdala en un lugar seguro (no la vas a usar en la app, pero no la pierdas).
   - **Region:** **South America (São Paulo)**, la más cercana a Colombia: los mensajes llegan más rápido.
3. **Create new project** y espera 1 a 2 minutos a que termine.

> ⚠️ **Usa un proyecto nuevo, solo para el messenger.** La base de datos queda limitada a 2 cuentas, así que no lo mezcles con otro proyecto. El plan gratis permite 2 proyectos; si ya tienes 2, tendrías que pausar uno.

## Paso 2 · Crear la base de datos

1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Abre `supabase/01_estructura.sql` con el Bloc de notas (o VS Code), copia **todo** y pégalo.
3. **Run**. Si Supabase pregunta si quieres ejecutar una operación "destructiva", confirma: es normal (el archivo limpia reglas viejas antes de crearlas).
4. Abajo debe aparecer **Listo ✅**.

## Paso 3 · Crear las 2 cuentas y cerrar el registro

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe tu correo y una contraseña, marca **Auto Confirm User** y toca **Create user**.
3. Repite con el correo de Estrellita. Ponle una contraseña temporal: **ella la cambia después desde la app** (Ajustes → Cuenta → Cambiar contraseña) para que solo ella la sepa.
4. Cierra el registro para siempre: **Authentication** → **Sign In / Providers** → apaga **Allow new users to sign up** → **Save changes**.

✅ Comprueba: **Table Editor** → tabla `perfiles` → deben verse 2 filas.

> Aunque alguien intentara crear una tercera cuenta, la base de datos la rechaza ("Database error saving new user"). Es la protección funcionando.

## Paso 4 · Conectar la app con Supabase

1. Copia 2 datos de Supabase:
   - **Project URL** (algo como `https://abcdefghijkl.supabase.co`): está en **Project Settings → Data API**, y también en la página principal del proyecto.
   - **Publishable key** (empieza por `sb_publishable_`): **Project Settings → API Keys**.
2. Abre `web/js/config.js` y pégalos entre las comillas:

```js
SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
```

> 🔒 La *publishable key* es pública por diseño (lo que protege los datos son las reglas de seguridad del paso 2). **Nunca** pegues en la web la **secret key** (`sb_secret_…`) ni la **service_role**: esas abren toda la base de datos.

## Paso 5 · Claves de las notificaciones

1. Abre `herramientas/generar-claves-vapid.html` con doble clic (en Chrome, Edge o Safari del computador).
2. Toca **Generar claves** y escribe tu correo real.
3. En Supabase: **Edge Functions** → **Secrets** → pega lo que copia el botón **Copiar las 3 para Supabase** → **Save**.
   Deben quedar 3 secretos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.
4. En `web/js/config.js`, reemplaza la línea de `VAPID_PUBLIC_KEY` por la que te da el botón **Copiar línea**.

> Genera las claves **una sola vez** y guárdalas. La privada nunca va en la web.

## Paso 6 · Publicar la función de notificaciones

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Ponle de nombre exactamente: `enviar-push`
3. Borra el código de ejemplo, pega **todo** `supabase/functions/enviar-push/index.ts` y toca **Deploy function**.
4. Ya publicada, entra a la función y en sus ajustes (**Details**) **apaga "Verify JWT"** y guarda.

> ¿Por qué apagarlo? La función ya comprueba la sesión por su cuenta (y solo deja avisar a quien envió el mensaje). Con las claves nuevas de Supabase, la verificación automática puede rechazar a usuarios válidos; así lo recomienda la propia documentación de Supabase.

## Paso 7 · Subir la app a Cloudflare Pages

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com) (crea la cuenta si no tienes, es gratis).
2. **Workers & Pages** → **Create application** → **Get started** (en la opción de Pages) → **Drag and drop your files**.
3. **Project name:** `estrellita-y-jampier` (esa será la dirección: `estrellita-y-jampier.pages.dev`; si ya existe, Cloudflare le agrega unas letras).
4. Arrastra **la carpeta `web`** (solo esa, no la carpeta completa del proyecto) → **Deploy site**.
5. Abre la dirección que te da Cloudflare. Debe salir la pantalla para entrar con correo y contraseña (si salen botones de "demo", revisa el paso 4).

**Para subir cambios en el futuro:** entra al proyecto en Cloudflare → **Create a new deployment** → vuelve a arrastrar la carpeta `web`. Antes de subir, cambia la versión en `web/sw.js` (`VERSION`) y en `web/js/config.js` (`VERSION`): así los celulares muestran "Hay una versión nueva de la app ✨".

## Paso 8 · El despertador (recomendado)

Supabase gratis pausa el proyecto si pasan 7 días sin actividad. Si chatean a diario no pasa nada, pero si un día se van de viaje juntos y no escriben, este "despertador" lo mantiene activo:

1. Cloudflare → **Workers & Pages** → **Create application** → empieza desde **Hello World** → **Deploy**.
2. **Edit code** → borra todo → pega `despertador/worker.js` → cambia las 2 líneas de arriba (`SUPABASE_URL` y `SUPABASE_KEY`, las mismas del paso 4) → **Deploy**.
3. En el worker: **Settings** → **Triggers** (o *Trigger events*) → **Cron Triggers** → agrega `0 */6 * * *` (cada 6 horas).
4. Abre la dirección del worker en el navegador: debe decir **✅ Supabase despierto**.

> Si algún día se pausa igual: Supabase → el proyecto → **Resume project**. No se pierde nada.

## Paso 9 · Instalar en los celulares

**iPhone (Safari):**
1. Abre la dirección `.pages.dev` en **Safari**.
2. Botón **Compartir** (cuadrito con flecha) → **Agregar a pantalla de inicio** → deja activado **Abrir como app web** → **Agregar**.
3. Abre la app **desde el ícono**, entra con tu correo, pon tu nombre y crea tu PIN.
4. **Ajustes → Avisos en este dispositivo** → **Permitir**.

**Android (Chrome):**
1. Abre la dirección en **Chrome** → menú **⋮** → **Instalar app** (o *Agregar a la pantalla principal*).
2. Abre la app, entra, crea tu PIN y activa los avisos en **Ajustes**.

**Computador (Chrome o Edge):** el ícono de instalar aparece en la barra de direcciones.

> 📱 En iPhone las notificaciones solo funcionan con iOS 16.4 o más nuevo y **abriendo la app desde el ícono**, no desde Safari.
> 🔋 En Android, si los avisos tardan con el celular bloqueado: Ajustes del celular → Batería → quita la optimización de batería a Chrome.

## Paso 10 · Prueba final

- [ ] Escríbele: con la app abierta, le llega al instante y ves ✓✓ y luego ✓✓ de color al leerlo.
- [ ] Que ella cierre la app: escríbele y le debe llegar la notificación.
- [ ] Prueben una foto, una nota de voz y el botón 💌 **Te extraño**.
- [ ] Pon el celular en modo avión y escribe: el mensaje queda con un relojito; quita el modo avión y se envía solo.
- [ ] Estrellita cambia su contraseña: **Ajustes → Cuenta → Cambiar contraseña**.

### Opcional · Blindaje extra del tiempo real

Cuando todo funcione: Supabase → **Realtime** → **Settings** → apaga **Allow public access** → **Save**. Así el "en línea" y el "escribiendo…" solo pueden viajar por el canal privado de ustedes dos. Prueba de nuevo; si algo deja de llegar al instante, vuelve a encenderlo.

---

## Lo que trae la app

- Mensajes al instante en ambos sentidos, con ✓ enviado, ✓✓ entregado y ✓✓ de color leído.
- "En línea", "últ. vez" y "escribiendo…" / "grabando audio…".
- Fotos (se comprimen a WebP para que suban rápido y ocupen poco), notas de voz con onda y velocidad 1x / 1.5x / 2x.
- Responder (deslizando el mensaje a la derecha), reaccionar, copiar, editar (15 min) y eliminar para los dos.
- 💌 **Te extraño**: tu pareja recibe una pantalla especial con lluvia de corazones. En Android, dejando presionado el ícono aparece el atajo "Enviar un Te extraño".
- PIN de 4 números, bloqueo automático y la pantalla se difumina en el selector de apps.
- Tema automático (claro: piel y lila; oscuro: negro y rojo suave) con botón para cambiarlo, y fondo con corazones, liso o con una foto suya.
- Funciona sin internet: los mensajes se guardan y salen solos al volver la conexión.
- Búsqueda en la conversación.

**Detalles que elegí para ustedes** (si alguno no les gusta, se quita): lluvia de corazones cuando mandan solo un ❤️, doble toque para reaccionar con ❤️, emojis grandes cuando el mensaje es solo emojis, separadores de día, sonido suave dentro del chat, borrador guardado, numerito de no leídos en el ícono, aviso de versión nueva, notificaciones **discretas** por defecto (dicen "E ❤ J · Tienes un mensaje nuevo 💌"; cada uno puede activar que se vea el texto en Ajustes), cambio de contraseña y protección contra borrado accidental de la conversación.

---

## Privacidad: qué protege y qué no

**Protege:**
- Solo pueden existir 2 cuentas y el registro está cerrado.
- Cada petición pasa por reglas de seguridad (RLS) probadas: nadie sin sesión ve nada, nadie puede escribir a nombre del otro, ni marcar "leído" a mano, ni tocar archivos ajenos.
- Fotos y audios en un depósito privado: se ven con enlaces temporales que vencen en 6 horas.
- El PIN protege la app en cada dispositivo; 5 intentos fallidos → espera; 10 → cierra la sesión.
- Si alguien intenta borrar una cuenta que tiene mensajes, Supabase lo impide: la conversación no se pierde por un clic equivocado.

**No es:** cifrado de extremo a extremo como WhatsApp o Signal. Quien entre a tu cuenta de Supabase podría ver la base de datos. Por eso:
- Activa la verificación en dos pasos (2FA) en tu cuenta de **Supabase** y de **Cloudflare**.
- No compartas nunca la *secret key*, la *service_role* ni la clave privada VAPID.

---

## Cuánto aguanta el plan gratis

| Recurso (Supabase Free) | Límite | En la práctica |
|---|---|---|
| Base de datos | 500 MB | Cientos de miles de mensajes de texto |
| Archivos | 1 GB | Unas 4.000 fotos, o unas 70 horas de notas de voz |
| Transferencia | 5 GB al mes | De sobra para 2 personas (las fotos se guardan en el celular después de verlas) |
| Funciones | 500.000 al mes | Cada mensaje usa 1 |
| Tiempo real | 2 millones de mensajes y 200 conexiones | De sobra |

Cloudflare Pages: gratis, sin límite de visitas. Para ver el consumo: Supabase → **Organization** → **Usage**. Si algún día se llena, el plan Pro de Supabase cuesta alrededor de US$25 al mes (revisa el precio actual en su página antes de decidir).

---

## Si algo falla

**"Correo o contraseña incorrectos"** → revisa en **Authentication → Users** que la cuenta exista y esté confirmada. Si la contraseña se olvidó, usa `supabase/02_nueva_contrasena.sql` (cambia el correo y la contraseña, y **Run**).

**"Tu cuenta entró, pero no tiene perfil"** → vuelve a ejecutar `supabase/01_estructura.sql` (es seguro repetirlo).

**"Database error deleting user"** al borrar una cuenta → es la protección: tiene mensajes. Para arreglar un problema de acceso nunca borres la cuenta; cambia la contraseña con el archivo `02`.

**Los mensajes llegan, pero solo al abrir la app de nuevo** → revisa que el paso 2 haya terminado en "Listo ✅". Si apagaste *Allow public access*, vuelve a encenderlo y prueba.

**No llegan notificaciones:**
1. iPhone: la app debe estar instalada desde Safari y abierta desde el ícono. Mira también Ajustes del iPhone → Notificaciones → E ❤ J.
2. Que los avisos estén activados en **Ajustes** de la app de quien debe recibirlos (es por dispositivo).
3. Si la otra persona tiene la app abierta en ese momento, no se manda aviso (ya lo está viendo).
4. Supabase → **Edge Functions** → `enviar-push` → **Logs**:
   - "Faltan los secretos VAPID…" → repite el paso 5.
   - "Aviso rechazado por web.push.apple.com: 403" → el `VAPID_SUBJECT` debe ser `mailto:` + un correo real.
   - Error 401 → apaga "Verify JWT" (paso 6).
5. Si cambiaste las claves VAPID: en cada celular apaga y vuelve a encender los avisos en Ajustes.

**Olvidé mi PIN** → en la pantalla del PIN toca **¿Olvidaste tu PIN?**: cierra la sesión en ese dispositivo y entras de nuevo con tu contraseña. Los mensajes siguen en la nube.

**La app no muestra los cambios que subí** → cambia `VERSION` en `web/sw.js` y en `web/js/config.js` antes de subir; luego en el celular toca **Actualizar** en el aviso "Hay una versión nueva de la app ✨".

---

## Ideas para la versión 2

- 📞 Llamadas de voz y videollamadas entre los dos.
- 🗓️ Contador de días juntos y recordatorio de fechas especiales.
- 📸 Álbum con todas sus fotos y "un día como hoy".
- ⏰ Mensajes programados (para que llegue un "buenos días" a la hora exacta).
- 💾 Botón para descargar toda la conversación como copia de seguridad.
- 🌐 Dominio propio (por ejemplo, `estrellitayjampier.com`), que se conecta a Cloudflare en minutos.

---

## Fuentes consultadas (documentación oficial, noviembre de 2026)

- [Supabase · Variables de entorno de Edge Functions](https://supabase.com/docs/guides/functions/secrets)
- [Supabase · Seguridad de Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [Supabase · Cabeceras de autorización](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase · Migrar a las claves publishable y secret](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Supabase · JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase · Crear funciones desde el panel](https://supabase.com/docs/guides/functions/quickstart-dashboard)
- [Supabase · Pausa de proyectos gratis](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Supabase · Facturación y límites del plan gratis](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Cloudflare Pages · Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
