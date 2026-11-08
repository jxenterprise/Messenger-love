# Messenger Estrellita y Jampier ❤️

Un chat privado solo para ustedes dos: mensajes al instante, fotos, notas de voz, "Te extraño" y notificaciones. Cada uno entra con **su usuario** (`jampier` o `estrellita`) y **el mismo PIN de 4 números**. Es una web (HTML, CSS y JS) que se instala en el celular como una app, en Android, iPhone y computador.

Todo funciona con planes **gratis**: Supabase (la base de datos y el tiempo real) y Cloudflare Pages (la página, en una dirección `.pages.dev`).

> Tiempo total la primera vez: unos 40 minutos, con calma. Haz los pasos en orden y no te saltes ninguno.

> 📍 **Estado actual (domingo 8 de noviembre de 2026, 3:25 p. m., hora de Colombia) · versión v1.6:** la app está **conectada a Supabase** (proyecto `messenger-eyj`, São Paulo), publicada en Cloudflare y **funcionando entre los dos**. Para entrar: **"Soy Jampier" o "Soy Estrellita" + el PIN**. Los ajustes y los avisos **no se reinician nunca** (quedan en la base de datos), hay cámara, se puede **vaciar el chat solo para ti o para los dos**, y el **despertador automático** de GitHub evita que Supabase pause el proyecto. El SQL de la v1.5 ya está ejecutado en Supabase (8 de noviembre, ~3:10 p. m.). Si falta instalarla en algún celular, mira los pasos 9 y 10. Lo nuevo de cada versión está en [Novedades](#novedades).

---

## Qué hay en esta carpeta

| Carpeta / archivo | Para qué sirve |
|---|---|
| `web/` | **La app.** Esta carpeta (y solo esta) es la que publica Cloudflare. |
| `web/js/config.js` | ✏️ El único archivo que tienes que editar: datos de Supabase, las personas de los botones "Soy …" (`PERSONAS`) y la versión (`VERSION`). |
| `supabase/01_estructura.sql` | Crea la base de datos y todas las reglas de seguridad. |
| `supabase/03_pin.sql` | ✏️ Crea el PIN de los dos (y desbloquea si hubo muchos intentos fallidos). |
| `supabase/02_nueva_contrasena.sql` | Plantilla de emergencia para la contraseña interna de una cuenta (casi nunca se usa). |
| `supabase/functions/entrar-con-pin/index.ts` | La función que revisa el usuario y el PIN para entrar. |
| `supabase/functions/enviar-push/index.ts` | La función que manda las notificaciones. |
| `herramientas/generar-claves-vapid.html` | Crea las claves de las notificaciones (se abre con doble clic). |
| `.github/workflows/despertador.yml` | El despertador automático: GitHub toca la base de datos 2 veces al día para que Supabase nunca "duerma" el proyecto. Ya está funcionando, no hay que hacer nada. |
| `despertador/worker.js` | Otra forma del despertador (en Cloudflare), por si algún día no quieren usar GitHub. |
| `desarrollo/` | Pruebas automáticas (no se publican en la web). |
| `wrangler.toml` | Le dice a Cloudflare que publique solo la carpeta `web`. No hay que tocarlo. |

> 💡 **¿Por qué al abrir la página sale "Casi listo"?** Porque la app todavía no tiene los datos de Supabase (pasos 1 a 4). Apenas los pegues en `web/js/config.js`, aparece la pantalla para entrar con usuario y PIN, y los mensajes van y vienen de verdad entre los dos celulares. No hay respuestas automáticas: lo que uno escribe le llega al otro.

> 🖥️ **Verla en tu computador antes de publicar:** en la carpeta `desarrollo` corre `npm install` (una sola vez) y luego `npm run ver`, y abre **http://localhost:8080**. Sin Supabase entra en modo vista previa: usuario `jampier` o `estrellita` y PIN `1234` (ese PIN solo existe en la vista previa).

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

## Paso 3 · Crear las 2 cuentas, el PIN y cerrar el registro

Cada cuenta necesita un correo por dentro, pero **nunca se usa para entrar** ni se envían correos: sirve para sacar el **usuario**. Lo más fácil es usar tu Gmail con un `+`:

| Para | Correo de la cuenta | Usuario para entrar |
|---|---|---|
| Ti | `tucorreo+jampier@gmail.com` | `jampier` |
| Estrellita | `tucorreo+estrellita@gmail.com` | `estrellita` |

(El usuario es lo que va después del `+`. Si usas un correo sin `+`, el usuario es lo que va antes de la `@`.)

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Escribe el primer correo, en **Password** pon cualquier clave larga (no se usa nunca; no hace falta recordarla), marca **Auto Confirm User** y toca **Create user**.
3. Repite con el correo de Estrellita.
4. Cierra el registro para siempre: **Authentication** → **Sign In / Providers** → apaga **Allow new users to sign up** → **Save changes**.
5. **Crea el PIN de los dos:** **SQL Editor** → **New query** → pega `supabase/03_pin.sql` → cambia el `0000` por su PIN → **Run**. Debe salir **PIN guardado ✅**.
   - Exactamente 4 números. No se aceptan los fáciles de adivinar (1234, 0000, 1111, 2580…).

✅ Comprueba: **Table Editor** → tabla `perfiles` → 2 filas, con la columna `usuario` en `jampier` y `estrellita`.

> Aunque alguien intentara crear una tercera cuenta, la base de datos la rechaza ("Database error saving new user"). Es la protección funcionando.

> 🔐 **Cómo se protege un PIN de 4 números:** lo revisa solo el servidor. 5 fallos seguidos → hay que esperar 15 minutos; 15 fallos → la cuenta queda bloqueada hasta que la desbloquees con `supabase/03_pin.sql`. Así nadie puede probar las 10.000 combinaciones. Los celulares que ya estaban adentro siguen funcionando aunque haya un bloqueo.

## Paso 4 · Conectar la app con Supabase

1. Copia 2 datos de Supabase:
   - **Project URL** (algo como `https://abcdefghijkl.supabase.co`): está en **Project Settings → Data API**, y también en la página principal del proyecto.
   - **Publishable key** (empieza por `sb_publishable_`): **Project Settings → API Keys**.
2. Abre `web/js/config.js` y pégalos entre las comillas:

```js
SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
SUPABASE_KEY: 'sb_publishable_xxxxxxxxxxxxxxxx',
```

**Hacerlo directo en GitHub (sin instalar nada):** en tu repositorio abre `web` → `js` → `config.js` → toca el lápiz ✏️ (**Edit this file**) → pega los 2 datos → **Commit changes…** → **Commit changes**. Cloudflare publica el cambio solo, en 1 o 2 minutos.

> 🔒 La *publishable key* es pública por diseño (lo que protege los datos son las reglas de seguridad del paso 2). **Nunca** pegues en la web la **secret key** (`sb_secret_…`) ni la **service_role**: esas abren toda la base de datos. Si por error la pegas, la app se niega a usarla y muestra un aviso rojo; en ese caso cámbiala por la publishable y crea una secret nueva en Supabase.

## Paso 5 · Claves de las notificaciones

1. Abre `herramientas/generar-claves-vapid.html` con doble clic (en Chrome, Edge o Safari del computador). Si no lo tienes en el computador: en GitHub abre el archivo → botón **Download raw file** (⬇) → doble clic al archivo descargado.
2. Toca **Generar claves** y escribe tu correo real.
3. En Supabase: **Edge Functions** → **Secrets** → pega lo que copia el botón **Copiar las 3 para Supabase** → **Save**.
   Deben quedar 3 secretos: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`.
4. En `web/js/config.js`, reemplaza la línea de `VAPID_PUBLIC_KEY` por la que te da el botón **Copiar línea**.

> Genera las claves **una sola vez** y guárdalas. La privada nunca va en la web.

## Paso 6 · Publicar las 2 funciones (entrar y notificaciones)

Se hace lo mismo dos veces, una por cada función:

| Nombre exacto | Archivo que se pega |
|---|---|
| `entrar-con-pin` | `supabase/functions/entrar-con-pin/index.ts` |
| `enviar-push` | `supabase/functions/enviar-push/index.ts` |

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Ponle el nombre exacto de la tabla.
3. Borra el código de ejemplo, pega **todo** el archivo y toca **Deploy function**.
4. Ya publicada, entra a la función y en sus ajustes (**Details**) **apaga "Verify JWT"** y guarda.

> ¿Por qué apagarlo? `entrar-con-pin` la usa alguien que todavía no ha entrado (viene justamente a entrar), y `enviar-push` ya comprueba la sesión por su cuenta. Con las claves nuevas de Supabase, la verificación automática puede rechazar a usuarios válidos; así lo recomienda la propia documentación de Supabase. Ninguna de las dos necesita secretos nuevos para entrar: Supabase ya les da la URL y las claves del servidor.

## Paso 7 · Publicar la app en Cloudflare Pages (conectada a GitHub)

Así, cada cambio que guardes en la rama `main` de GitHub se publica solo.

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com) (crea la cuenta si no tienes, es gratis).
2. **Workers & Pages** → **Create application** → **Pages** → conecta tu cuenta de GitHub y elige el repositorio `Messenger-love`.
3. Llena la configuración así:

   | Campo | Valor |
   |---|---|
   | Project name | `messenger-estrellita-jampier-18` (será la dirección `nombre.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | *(vacío)* |
   | Build output directory | `web` |
   | Root directory (advanced) | *(vacío)* |

4. **Save and Deploy**, espera 1 minuto y abre la dirección `.pages.dev`.

✅ Comprueba: debe salir el logo y la pantalla para entrar con usuario y PIN (o "Casi listo" si aún no hiciste el paso 4).

> 🧭 **El archivo `wrangler.toml` ya se encarga de lo importante:** le dice a Cloudflare que publique solo la carpeta `web`. Por eso en el panel de Cloudflare el *Build output directory* aparece bloqueado: se cambia en ese archivo, no allá. Si algún día cambias el nombre del proyecto en Cloudflare, cambia también la línea `name` de `wrangler.toml`.
>
> Sin ese archivo, Cloudflare publicaría la carpeta completa del proyecto: la página saldría en blanco (error 404) y quedarían a la vista el README y los archivos SQL.

**Para subir cambios en el futuro:** edita los archivos en GitHub (lápiz ✏️) o súbelos con **Add file → Upload files**, siempre en la rama `main`, y Cloudflare publica solo. Cuando cambies algo de la carpeta `web`, sube también la versión en `web/sw.js` (`VERSION`) y en `web/js/config.js` (`VERSION`): así los celulares muestran "Hay una versión nueva de la app ✨". La versión se ve pequeña debajo de "Nuestro rincón privado" y va así: **v1.0, v1.1, v1.2 … hasta v1.50, y después v2.0**.

<details>
<summary>Otra forma: subir la carpeta a mano, sin GitHub</summary>

1. **Workers & Pages** → **Create application** → **Pages** → **Drag and drop your files** (*Upload assets*).
2. Ponle nombre al proyecto, arrastra **solo la carpeta `web`** → **Deploy site**.
3. Para cambios: entra al proyecto → **Create a new deployment** → vuelve a arrastrar la carpeta `web`.

</details>

## Paso 8 · El despertador (ya viene listo)

Supabase gratis pausa el proyecto si pasan 7 días con poca actividad. Si chatean a diario no pasa nada, pero si un día se van de viaje juntos y no escriben, el **despertador** lo mantiene activo.

**Ya está funcionando solo, en GitHub** (`.github/workflows/despertador.yml`): 2 veces al día (12:17 a. m. y 12:17 p. m., hora de Colombia) toca la base de datos con la URL y la clave publicable de `web/js/config.js`. No usa secretos ni cuesta nada.

- **Para ver que funciona:** GitHub → el repositorio → pestaña **Actions** → **Despertador**. Cada vuelta con ✅ verde dice "Supabase despierto". Con **Run workflow** lo pruebas cuando quieras.
- **Si una vuelta sale con ❌ roja:** ábrela y lee el mensaje. Casi siempre es que el proyecto ya estaba pausado: Supabase → el proyecto → **Restore**.
- GitHub apaga lo programado si un repositorio público pasa 60 días sin cambios; por eso el despertador se vuelve a activar solo cada vez que corre. Si algún día aparece "This scheduled workflow is disabled", toca **Enable workflow**.

<details>
<summary>Otra forma: el despertador en Cloudflare (solo si no quieren usar GitHub)</summary>

1. Cloudflare → **Workers & Pages** → **Create application** → empieza desde **Hello World** → **Deploy**.
2. **Edit code** → borra todo → pega `despertador/worker.js` → cambia las 2 líneas de arriba (`SUPABASE_URL` y `SUPABASE_KEY`, las mismas del paso 4) → **Deploy**.
3. En el worker: **Settings** → **Triggers** (o *Trigger events*) → **Cron Triggers** → agrega `0 */6 * * *` (cada 6 horas).
4. Abre la dirección del worker en el navegador: debe decir **✅ Supabase despierto**.

</details>

> Si algún día se pausa igual: Supabase → el proyecto → **Restore** (o *Resume project*). No se pierde nada.

## Paso 9 · Instalar en los celulares

**iPhone (Safari):**
1. Abre la dirección `.pages.dev` en **Safari**.
2. Botón **Compartir** (cuadrito con flecha) → **Agregar a pantalla de inicio** → deja activado **Abrir como app web** → **Agregar**.
3. Abre la app **desde el ícono**, toca **"Soy Estrellita"** (o "Soy Jampier") y escribe el PIN.
4. **Ajustes → Avisos en este dispositivo** → **Permitir**.

**Android (Chrome):**
1. Abre la dirección en **Chrome** → menú **⋮** → **Instalar app** (o *Agregar a la pantalla principal*).
2. Abre la app, toca **"Soy Jampier"**, escribe el PIN y activa los avisos en **Ajustes**.

**Computador (Chrome o Edge):** el ícono de instalar aparece en la barra de direcciones.

> 📱 En iPhone las notificaciones solo funcionan con iOS 16.4 o más nuevo y **abriendo la app desde el ícono**, no desde Safari.
> 🔋 En Android, si los avisos tardan con el celular bloqueado: Ajustes del celular → Batería → quita la optimización de batería a Chrome.

## Paso 10 · Prueba final

- [ ] Escríbele: con la app abierta, le llega al instante y ves ✓✓ y luego ✓✓ de color al leerlo.
- [ ] Que ella cierre la app: escríbele y le debe llegar la notificación.
- [ ] Prueben una foto, una nota de voz y el botón 💌 **Te extraño**.
- [ ] Pon el celular en modo avión y escribe: el mensaje queda con un relojito; quita el modo avión y se envía solo.
- [ ] Pongan un PIN que solo ustedes dos sepan desde **Ajustes → Seguridad → Cambiar PIN** (cambia para los dos).
- [ ] Escribe un PIN equivocado a propósito: debe decir "Usuario o PIN incorrectos".

### Opcional · Blindaje extra del tiempo real

Cuando todo funcione: Supabase → **Realtime** → **Settings** → apaga **Allow public access** → **Save**. Así el "en línea" y el "escribiendo…" solo pueden viajar por el canal privado de ustedes dos. Prueba de nuevo; si algo deja de llegar al instante, vuelve a encenderlo.

---

## Lo que trae la app

- Mensajes al instante en ambos sentidos, con ✓ enviado, ✓✓ entregado y ✓✓ de color leído.
- "En línea", "últ. vez" y "escribiendo…" / "grabando audio…".
- Fotos de la galería o **tomadas con la cámara** (botón 📷, en el celular). Se comprimen a WebP y **nunca pasan de 5 MB**, aunque el celular las tome enormes. Notas de voz con onda y velocidad 1x / 1.5x / 2x.
- Responder (deslizando el mensaje a la derecha), reaccionar, copiar, editar (15 min) y eliminar para los dos.
- **Borrar mensajes** (menú ⋮ → *Borrar mensajes*), tres opciones:
  - **Uno solo:** mantén presionado tu mensaje → *Eliminar para los dos*.
  - **Vaciar solo para mí:** el chat queda vacío en tu celular (y en tus otros dispositivos), pero tu pareja lo sigue viendo y nada se borra de la nube.
  - **Vaciar para los dos:** con doble confirmación. Se borran los mensajes, fotos y notas de voz de la nube y desaparecen de los dos celulares. No se puede deshacer.
- **Nada se reinicia:** tema, fondo, sonido, bloqueo, velocidad de los audios y notificaciones quedan guardados en la base de datos. Aunque cierres sesión, borres los datos o cambies de celular, al entrar todo vuelve como lo dejaste.
- 💌 **Te extraño**: tu pareja recibe una pantalla especial con lluvia de corazones. En Android, dejando presionado el ícono aparece el atajo "Enviar un Te extraño".
- Entrar tocando **"Soy Jampier" / "Soy Estrellita"** y el PIN de 4 números (el mismo para los dos), bloqueo automático con ese PIN y la pantalla se difumina en el selector de apps.
- Tema automático (claro: piel y lila; oscuro: negro y rojo suave) con botón para cambiarlo, y fondo con corazones, liso o con una foto suya.
- Funciona sin internet: los mensajes se guardan y salen solos al volver la conexión.
- Búsqueda en la conversación.

**Detalles que elegí para ustedes** (si alguno no les gusta, se quita): lluvia de corazones cuando mandan solo un ❤️, doble toque para reaccionar con ❤️, emojis grandes cuando el mensaje es solo emojis, separadores de día, sonido suave dentro del chat, borrador guardado, numerito de no leídos en el ícono, aviso de versión nueva, notificaciones **discretas** por defecto (dicen "E ❤ J · Tienes un mensaje nuevo 💌"; cada uno puede activar que se vea el texto en Ajustes), cambio de PIN desde la app y protección contra borrado accidental de la conversación.

---

## Privacidad: qué protege y qué no

**Protege:**
- Solo pueden existir 2 cuentas y el registro está cerrado.
- Cada petición pasa por reglas de seguridad (RLS) probadas: nadie sin sesión ve nada, nadie puede escribir a nombre del otro, ni marcar "leído" a mano, ni tocar archivos ajenos.
- Fotos y audios en un depósito privado: se ven con enlaces temporales que vencen en 6 horas.
- El PIN lo revisa el servidor y se guarda cifrado (bcrypt): 5 fallos seguidos → esperar 15 minutos; 15 → cuenta bloqueada. No hay PINs fáciles (1234, 0000…).
- En cada celular, el bloqueo automático pide el mismo PIN (guardado cifrado); 10 fallos → cierra la sesión. Si el PIN se cambia en un celular, el otro pide el nuevo.
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

**La dirección `.pages.dev` sale en blanco (o "404")** → revisa que `wrangler.toml` esté en la raíz del repositorio, que su línea `name` sea igual al nombre del proyecto en Cloudflare, y que los cambios estén en la rama `main` (la dirección principal solo publica `main`). Después de guardar, espera 1 o 2 minutos y recarga.

**Sale la pantalla "Casi listo 💜"** → faltan la URL y la *publishable key* de Supabase en `web/js/config.js` (paso 4). Mientras tanto la app no muestra conversaciones de ejemplo; el botón **Ver una vista previa** abre una demo con mensajes de mentira que no salen del celular.

**Sale el aviso rojo "Esa clave no va aquí"** → en `web/js/config.js` pegaste la *secret key* o la *service_role*. Pon la *publishable key* y, por seguridad, crea una secret nueva en Supabase (**Project Settings → API Keys**).

**"Usuario o PIN incorrectos"** → el PIN es el que pusiste en `supabase/03_pin.sql` o en Ajustes. Si cambiaste un usuario, revisa que el `usuario` de **Table Editor → perfiles** sea igual al de `PERSONAS` en `web/js/config.js` (hoy: `jampier` y `estrellita`).

**"Al entrar como Jampier arriba dice Estrellita"** → es lo correcto: arriba sale la persona con la que hablas, como en WhatsApp. Al entrar aparece "Hola, Jampier 💜 Estás hablando con Estrellita", tus mensajes salen a la derecha y la casilla dice "Escríbele a Estrellita…".

**"Demasiados intentos. Espera…"** → hubo 5 fallos seguidos: espera los minutos que dice.

**"Cuenta bloqueada por seguridad"** → hubo 15 fallos. Desbloquéala: corre `supabase/03_pin.sql` (eso pone el PIN y desbloquea) o solo la línea `select privado.desbloquear();` que trae el archivo.

**"Todavía no se ha creado el PIN"** → falta el punto 5 del paso 3.

**"Falta publicar la función «entrar-con-pin»"** → repite el paso 6 con esa función. Si dice que apagues **Verify JWT**, hazlo en los ajustes de la función.

**"Tu cuenta entró, pero no tiene perfil"** → vuelve a ejecutar `supabase/01_estructura.sql` (es seguro repetirlo).

**"Database error deleting user"** al borrar una cuenta → es la protección: tiene mensajes. Para arreglar un problema de acceso nunca borres la cuenta: pon el PIN otra vez con `supabase/03_pin.sql`.

**Los mensajes llegan, pero solo al abrir la app de nuevo** → revisa que el paso 2 haya terminado en "Listo ✅". Si apagaste *Allow public access*, vuelve a encenderlo y prueba.

**No llegan notificaciones:**
1. iPhone: la app debe estar instalada desde Safari y abierta desde el ícono. Mira también Ajustes del iPhone → Notificaciones → E ❤ J.
2. Que los avisos estén activados en **Ajustes** de la app de quien debe recibirlos. Se quedan como los dejes: solo se apagan si tú los apagas ahí.
3. Si la otra persona tiene la app abierta en ese momento, no se manda aviso (ya lo está viendo).
4. Supabase → **Edge Functions** → `enviar-push` → **Logs**:
   - "Faltan los secretos VAPID…" → repite el paso 5.
   - "Aviso rechazado por web.push.apple.com: 403" → el `VAPID_SUBJECT` debe ser `mailto:` + un correo real.
   - Error 401 → apaga "Verify JWT" (paso 6).
5. Si cambiaste las claves VAPID: en cada celular apaga y vuelve a encender los avisos en Ajustes.

**Olvidé el PIN** → es el mismo de los dos: pregúntaselo a tu amor 💜. Si ninguno lo recuerda, pon uno nuevo con `supabase/03_pin.sql`. Los mensajes siguen en la nube.

**Los ajustes o los avisos vuelven a como estaban antes** → falta el SQL de la v1.5: ejecuta otra vez `supabase/01_estructura.sql` en el SQL Editor (es seguro repetirlo). Mientras falte, la app funciona, pero los ajustes solo se guardan en ese celular y "Vaciar todo el chat" da error.

**Cerré sesión y no me llegan avisos** → al cerrar sesión los avisos **siguen** llegando a ese celular (así lo pediste). Si no llegan, revisa la lista de "No llegan notificaciones" de abajo.

**La app no muestra los cambios que subí** → cambia `VERSION` en `web/sw.js` y en `web/js/config.js` antes de subir; luego en el celular toca **Actualizar** en el aviso "Hay una versión nueva de la app ✨".

---

## Novedades

Numeración: **v1.0, v1.1, v1.2 … hasta v1.50; después v2.0**. Las primeras versiones tenían otro número; aquí van con los dos.

**v1.6 · domingo 8 de noviembre de 2026, 3:25 p. m. — Vaciar el chat solo para ti**
- En el menú ⋮ → *Borrar mensajes* ahora hay dos botones: **Vaciar solo para mí** (el chat queda vacío en tu celular; tu pareja lo sigue viendo y todo queda guardado en la nube) y **Vaciar para los dos** (como en la v1.5, con doble confirmación).
- "Solo para mí" se guarda en tus ajustes de la nube: también queda vacío en tus otros dispositivos y no vuelve a aparecer aunque cierres sesión. Los mensajes nuevos sí se ven, y la búsqueda no muestra los que vaciaste.
- El SQL de la v1.5 ya quedó ejecutado en Supabase (comprobado: la función `vaciar_chat`, la tabla `chat_estado` y la columna `preferencias` existen y nadie sin sesión puede usarlas). La v1.6 no necesita SQL nuevo.
- Pruebas: 469 en total, todas bien (32 de la app, con una nueva que revisa que los 3 botones se vean completos en el celular sin deslizar).

**v1.5 · domingo 8 de noviembre de 2026, 3:15 p. m. — Nada se reinicia, cámara, vaciar el chat y despertador**
- **Arreglado: al volver a entrar, las notificaciones aparecían apagadas.** Había dos causas: cerrar sesión (o un PIN cambiado) apagaba los avisos, y al abrir la app la suscripción no se renovaba. Ahora los avisos se quedan como los dejes, se renuevan solos cada vez que entras y **solo se apagan si los apagas en Ajustes**. Al cerrar sesión siguen llegando.
- **Los ajustes quedan guardados en la base de datos** (columna nueva `perfiles.preferencias`): tema, fondo, sonido, tiempo de bloqueo, velocidad de los audios y avisos. Si cambias algo sin señal, se sube solo al volver la conexión. Celular nuevo o datos borrados → al entrar todo vuelve como estaba.
- **Cerrar sesión ya no borra nada** del celular (mensajes guardados, borrador, ajustes): solo olvida el PIN guardado, para que haya que poner el PIN de nuevo.
- **Cámara 📷**: botón nuevo junto al de la galería (solo en celulares) que abre la cámara directo. Las fotos se comprimen hasta quedar **por debajo de 5 MB** (si una sale pesada, se reduce más hasta que quepa).
- **Borrar mensajes**: en el menú ⋮ → *Borrar mensajes* se explica cómo borrar uno solo y está el botón **Vaciar todo el chat** (para los dos, con doble confirmación). Borra mensajes, fotos y notas de voz de la nube y el otro celular se vacía al instante (o apenas se conecte).
- **Despertador automático en GitHub** (`.github/workflows/despertador.yml`): 2 veces al día toca la base de datos para que Supabase nunca pause el proyecto. Probado contra el proyecto real: responde "ok".
- Arreglado: dos diálogos seguidos (como la doble confirmación) podían sacar la app a una página en blanco por un cruce con el botón "atrás".
- **Hay que volver a ejecutar `supabase/01_estructura.sql`** en Supabase (añade `preferencias`, la tabla `chat_estado`, la función `vaciar_chat` y el permiso para borrar archivos que ya nadie usa). Es seguro repetirlo.
- Pruebas: 462 en total, todas bien (158 de base de datos, 59 de ingreso, 26 de la app, 70 de sus dos celulares, 90 de pantallas…).

**v1.4 · domingo 8 de noviembre de 2026, 2:05 a. m. — "Soy Jampier / Soy Estrellita" y revisión completa**
- Para entrar ya no se escribe ningún nombre: primero **"¿Quién eres?"** con los botones "Soy Jampier" y "Soy Estrellita"; después solo el PIN (entra sola al 4.º número). "No soy yo" vuelve a elegir. Los botones salen de `PERSONAS` en `web/js/config.js`.
- La versión se ve pequeña debajo de "Nuestro rincón privado" (v1.4).
- Más claro quién entró: al entrar sale "Hola, Jampier 💜 Estás hablando con Estrellita" y la casilla dice "Escríbele a Estrellita…" (arriba siempre va la persona con la que hablas, como en WhatsApp; no era que entrara a la otra cuenta).
- Arreglado: al deslizar, las fechas pegadas arriba se montaban una encima de otra ("Ayer" sobre "Viernes"); ahora solo se ve la del día que estás mirando.
- Arreglado: al bloquear justo después de un "Te extraño", la lluvia de corazones y los avisos quedaban encima del teclado del PIN.
- En el iPhone el teclado de números se abre solo al tocar tu nombre.
- Revisión completa: sus dos celulares (Redmi Note 14 Pro+ con Chrome, iPhone 12 Pro Max con el motor de Safari, notch y barra de inicio) y 10 tamaños más (desde 280 px de ancho hasta monitor grande). Nada se sale de la pantalla y no hay errores.
- Pruebas nuevas: `prueba_celulares.mjs` y `prueba_pantallas.mjs`.

**v1.3 (antes 1.1.1) · 8 de noviembre de 2026, 1:08 a. m. — Conectada a Supabase**
- `web/js/config.js` ya tiene la Project URL, la publishable key y la clave pública VAPID del proyecto `messenger-eyj` (todas públicas por diseño; las secretas solo están en Supabase).
- Supabase configurado: base de datos (`01_estructura.sql`), cuentas `jampier` y `estrellita` con sus correos reales, registro cerrado, PIN creado, secretos VAPID y funciones `entrar-con-pin` y `enviar-push` con Verify JWT apagado.
- Comprobado en el proyecto real: sin sesión no se ve nada (perfiles, mensajes ni la revisión del PIN), y la app conectada responde bien al entrar.

**v1.2 (antes 1.1.0) · 7 de noviembre de 2026, 1:21 a. m. — Entrar con usuario + PIN**
- Cada uno entra con su usuario (`jampier` o `estrellita`) y el mismo PIN de 4 números. Ya no hay correo ni contraseña en la app.
- El PIN lo revisa el servidor y se guarda cifrado: 5 fallos seguidos → esperar 15 minutos; 15 → cuenta bloqueada hasta desbloquearla con `supabase/03_pin.sql`. No se aceptan PINs fáciles.
- Nueva función de Supabase `entrar-con-pin` y nueva plantilla `supabase/03_pin.sql` (crear el PIN y desbloquear).
- El bloqueo automático del celular usa el mismo PIN. **Ajustes → Cambiar PIN** lo cambia para los dos, y el otro celular pide el nuevo.
- Se quitó "Cambiar contraseña" y el paso de crear un PIN aparte al entrar por primera vez.
- Pruebas: todas en Node, corren en Windows sin instalar nada más (`npm test` en `desarrollo`). Se pueden ver los cambios en el computador con `npm run ver` (http://localhost:8080).

**v1.1 (antes 1.0.1) · 6 de noviembre de 2026, 12:13 p. m. — La página ya se ve**
- `wrangler.toml`: Cloudflare publica solo la carpeta `web` (antes salía en blanco con error 404 y se veían el README y los SQL).
- Sin Supabase, la página muestra "Casi listo" en vez de la conversación de ejemplo con respuestas automáticas. El demo solo abre con el botón "Ver una vista previa".
- La app instalada vuelve a abrir sin señal (arreglo del service worker para Cloudflare).
- Si se pega por error la clave secreta de Supabase, la app se niega a usarla y muestra un aviso rojo.

**v1.0 (antes 1.0.0) · 6 de noviembre de 2026, 11:15 a. m. — Primera versión**
- Chat completo: mensajes al instante, fotos, notas de voz, "Te extraño", notificaciones, modo sin señal, tema claro/oscuro y búsqueda.

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
- [GitHub Actions · Desactivar y activar flujos (60 días sin actividad)](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)
- [Supabase · Facturación y límites del plan gratis](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase · auth.admin.generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink)
- [Supabase · auth.verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase · Inicio sin contraseña (token_hash)](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Cloudflare Pages · Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Cloudflare Pages · Conectar con GitHub](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages · Configuración de compilación](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages · Cabeceras (`_headers`)](https://developers.cloudflare.com/pages/configuration/headers/)
