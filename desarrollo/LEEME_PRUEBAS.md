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

Sin datos de Supabase entra en modo vista previa: usuario `jampier` o `estrellita` y PIN `1234` (solo existe en la vista previa; el PIN real nunca puede ser 1234).

## Cada prueba por separado

| Comando | Qué prueba |
|---|---|
| `npm run prueba:sql` | 136 pruebas de `01_estructura.sql`: reglas de seguridad (RLS), máximo 2 cuentas, mensajes, tiempo real, archivos, plantillas 02 y 03, y el **PIN**: cifrado, 5 fallos → esperar, 15 → bloqueo, cambio de PIN que también cuenta intentos. |
| `npm run prueba:entrar` | La función `entrar-con-pin` empaquetada como en Supabase, con la librería real de Supabase y la base de datos real detrás. |
| `npm run prueba:funcion` | La función `enviar-push`: descifra cada aviso con `http_ece` y verifica la firma VAPID (34 pruebas). |
| `npm run prueba:ingreso` | En el navegador: entrar con usuario + PIN, bloqueo, cambiar PIN, PIN cambiado en el otro celular, la app **conectada** a un Supabase imitado (función + canje del pase), "Casi listo" y la clave secreta. |
| `npm run prueba:app` | En el navegador: la app completa en modo demo (texto, respuesta, nota de voz, foto, "Te extraño", tema, ajustes, búsqueda, bloqueo) en celular y computador. |
| `npm run prueba:sin-senal` | Con un servidor que imita a Cloudflare (`/index.html` → `/`): la app instalada abre sin internet. También acepta una dirección: `node prueba_sin_senal.mjs https://…pages.dev/?demo`. |
| `npm run prueba:generador` | Abre `herramientas/generar-claves-vapid.html` y valida las claves con `web-push`. |
| `npm run prueba:deno` | (Opcional) La función de avisos corriendo en Deno real. |
| `npm run vista-previa` | Crea el HTML único de la vista previa (modo demo con todo incrustado). |

Las capturas de pantalla quedan en `desarrollo/capturas/`. Cada prueba termina diciendo **TODO OK** o lista lo que falló.

## Archivos de apoyo

- `supabase_simulado.sql` — imita lo que Supabase ya trae (esquemas `auth`, `storage`, `realtime`, roles y `auth.uid()`).
- `servidor_cloudflare.mjs` — sirve `web/` como lo hace Cloudflare Pages (redirecciones incluidas).
- `apoyo_navegador.mjs` — abre el navegador, el servidor y lleva la cuenta de las pruebas.
