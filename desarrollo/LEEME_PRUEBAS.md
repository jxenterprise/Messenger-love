# Pruebas automáticas — Messenger Estrellita y Jampier ❤️

Esta carpeta es solo para desarrollo: **no se sube a Cloudflare ni a Supabase**. Sirve para comprobar, antes de publicar un cambio, que la seguridad, las notificaciones y la app siguen funcionando.

Requisitos: Node 20+, Python 3.11+ y (para la base de datos) PostgreSQL 16.

```bash
cd desarrollo
npm install
pip install "psycopg[binary]" bcrypt playwright
```

## 1. Base de datos y seguridad (86 pruebas)

Usa un PostgreSQL **de pruebas** (el script crea y borra la base `prueba_eyj` y los roles `anon`, `authenticated`, `service_role`, `supabase_auth_admin`). Nunca lo apuntes a una base real.

```bash
python3 prueba_sql.py <host o carpeta del socket> <puerto> supabase_simulado.sql \
  ../supabase/01_estructura.sql ../supabase/02_nueva_contrasena.sql
```

`supabase_simulado.sql` imita lo que Supabase ya trae (esquemas `auth`, `storage`, `realtime`, roles y `auth.uid()`).

## 2. Función de notificaciones

```bash
npm run prueba:funcion   # 34 pruebas en Node: descifra cada aviso con http_ece y verifica la firma VAPID
npm run prueba:deno      # la función corriendo en Deno real contra un Supabase simulado
```

## 3. La app en el navegador (modo demo)

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory ../web   # en otra terminal
python3 prueba_app.py http://127.0.0.1:8765/ capturas ../web/img/demo/atardecer.webp
python3 prueba_clave.py http://127.0.0.1:8765/ capturas
python3 prueba_bloqueo.py http://127.0.0.1:8765/ capturas
```

Con `CHROME=/ruta/a/google-chrome` usa Chrome (recomendado: su micrófono falso graba notas de voz reales). Al final debe decir **SIN ERRORES EN CONSOLA** y deja capturas en `capturas/`.

## 4. Generador de claves y vista previa

```bash
npm run prueba:generador   # abre herramientas/generar-claves-vapid.html y valida las claves con web-push
npm run vista-previa       # crea el HTML único de la vista previa (modo demo con todo incrustado)
```
