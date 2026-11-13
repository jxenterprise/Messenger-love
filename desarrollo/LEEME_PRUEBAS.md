# Pruebas automáticas — Messenger Estrellita y Jampier ❤️

Esta carpeta es solo para desarrollo: **no se publica en Cloudflare ni se sube a Supabase**. Sirve para comprobar, antes de publicar un cambio, que la seguridad, el ingreso con PIN, las notificaciones y la app siguen funcionando.

Solo hace falta **Node 20 o más nuevo**. Funciona igual en Windows, Mac y Linux:

- La base de datos se prueba con **PGlite** (un PostgreSQL de verdad que corre dentro de Node): no hay que instalar PostgreSQL.
- El navegador es **Microsoft Edge** (viene con Windows). Si no está, se usa Chrome con `CHROME=ruta`, o el Chromium de Playwright (`npx playwright install chromium`).

```bash
cd desarrollo
npm install        # una sola vez
npm test           # corre TODAS las pruebas (unos 3 minutos)
```

## Ver la app en el computador

```bash
npm run ver        # abre http://localhost:8080
```

Con los datos de Supabase que ya tiene `web/js/config.js`, `npm run ver` abre la app **real** (mensajes de verdad). Las pruebas automáticas nunca usan el proyecto real: cargan `config.js` sin esos datos y entran en modo vista previa ("Soy Jampier" o "Soy Estrellita" + PIN `1234`, que solo existe en la vista previa) o usan un Supabase imitado.

## Cada prueba por separado

| Comando | Qué prueba |
|---|---|
| `npm run prueba:sql` | 174 pruebas de `01_estructura.sql`: reglas de seguridad (RLS), máximo 2 cuentas, mensajes, tiempo real, archivos, plantillas 02 y 03, el **PIN** (cifrado, 5 fallos → esperar, 15 → bloqueo, cambio de PIN que también cuenta intentos), los **ajustes** (`perfiles.preferencias`: cada uno solo los suyos, tamaño máximo) y **vaciar el chat** (`vaciar_chat`, `chat_estado`, borrar archivos que ya nadie usa). |
| `npm run prueba:entrar` | La función `entrar-con-pin` empaquetada como en Supabase, con la librería real de Supabase y la base de datos real detrás. |
| `npm run prueba:funcion` | La función `enviar-push`: descifra cada aviso con `http_ece` y verifica la firma VAPID (34 pruebas). |
| `npm run prueba:ingreso` | En el navegador (59): entrar con usuario + PIN, bloqueo, cambiar PIN, PIN cambiado en el otro celular, **ajustes que no se reinician** (cerrar sesión no borra nada; con el celular "borrado" vuelven desde la nube), la app **conectada** a un Supabase imitado (función + canje del pase + subida de `preferencias` + `chat_estado`), "Casi listo" y la clave secreta. |
| `npm run prueba:app` | En el navegador (32): la app completa en modo demo (texto, respuesta, nota de voz, foto, botón de cámara, "Te extraño", tema, ajustes, búsqueda, bloqueo, **vaciar el chat solo para mí** y **para los dos** con doble confirmación, y que los botones se vean completos) en celular y computador. |
| `npm run prueba:pantallas` | 10 tamaños (Galaxy Fold 280 px, Android pequeño, iPhone SE, iPhone 15, Pixel 7, iPhone 15 Pro Max, celular acostado, iPad, portátil y monitor): que nada se salga a los lados en ninguna pantalla. |
| `npm run prueba:celulares` | **Los 2 celulares de la pareja**: iPhone 12 Pro Max (428 × 926, motor de Safari, con notch y barra de inicio simulados) y Redmi Note 14 Pro+ (≈ 407 × 904 en Chrome, con barras y con pantalla ampliada). Revisa que nada quede tapado. Para usar el motor de Safari, instálalo una vez con `npm run instalar:safari`; si no está, usa el de Chrome. |
| `npm run prueba:sin-senal` | Con un servidor que imita a Cloudflare (`/index.html` → `/`): la app instalada abre sin internet. También acepta una dirección: `node prueba_sin_senal.mjs https://…pages.dev/?demo`. |
| `npm run prueba:generador` | Abre `herramientas/generar-claves-vapid.html` y valida las claves con `web-push`. |
| `npm run prueba:papelera` | La Papelera (52, con filtros, foto en grande, descarga y que la página baje): que el chat esconda lo eliminado y `/papelera` sí lo muestre, el aviso al eliminar, que la ven los dos, que sin sesión no muestre nada, que el PIN la proteja, los filtros y el computador. |
| `npm run prueba:redes` | La vista previa al compartir (40): etiquetas Open Graph con direcciones completas, la imagen (JPEG 1200 × 630, liviana), `robots.txt` (buscadores fuera, robots de vista previa adentro), la redirección de la carpeta vieja (`_redirects`) y la portada + imagen servidas como en Cloudflare a cada robot. |
| `npm run imagen:redes` | Rehace la imagen para compartir (`web/img/Juntos/Estrellita_y_Jampier_redes.jpg`). Con `-- --original "ruta"` la cambia por otra foto. |
| `npm run prueba:deno` | (Opcional) La función de avisos corriendo en Deno real. |
| `npm run vista-previa` | Crea el HTML único de la vista previa (modo demo con todo incrustado). |

Las capturas de pantalla quedan en `desarrollo/capturas/`. Cada prueba termina diciendo **TODO OK** o lista lo que falló.

## Archivos de apoyo

- `supabase_simulado.sql` — imita lo que Supabase ya trae (esquemas `auth`, `storage`, `realtime`, roles y `auth.uid()`).
- `servidor_cloudflare.mjs` — sirve `web/` como lo hace Cloudflare Pages (redirecciones incluidas).
- `apoyo_navegador.mjs` — abre el navegador, el servidor y lleva la cuenta de las pruebas.
