"""Prueba 01_estructura.sql en un PostgreSQL local que imita a Supabase.

Simula las peticiones de la app (rol authenticated + JWT) y verifica que
las reglas de seguridad hagan exactamente lo que deben.
"""
import json
import sys
import uuid
from pathlib import Path

import psycopg

HOST, PUERTO = sys.argv[1], sys.argv[2]
SIMULADO = Path(sys.argv[3]).read_text()
ESTRUCTURA = Path(sys.argv[4]).read_text()

fallos = []
pruebas = 0


def conectar(db="postgres"):
    return psycopg.connect(host=HOST, port=PUERTO, user="postgres", dbname=db, autocommit=True)


def ok(cond, texto):
    global pruebas
    pruebas += 1
    print(("  ✓ " if cond else "  ✗ ") + texto)
    if not cond:
        fallos.append(texto)


class Como:
    """Ejecuta SQL como lo haría PostgREST para un usuario (o anónimo)."""

    def __init__(self, con, usuario=None, rol="authenticated"):
        self.con, self.usuario, self.rol = con, usuario, rol

    def __call__(self, sql, params=None, tema=None):
        with self.con.transaction():
            cur = self.con.cursor()
            cur.execute(f"set local role {self.rol}")
            claims = {"role": self.rol}
            if self.usuario:
                claims["sub"] = str(self.usuario)
            cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps(claims),))
            if tema:
                cur.execute("select set_config('realtime.topic', %s, true)", (tema,))
            cur.execute(sql, params)
            try:
                return cur.fetchall()
            except psycopg.ProgrammingError:
                return cur.rowcount

    def falla(self, sql, params=None, tema=None, contiene=""):
        try:
            self(sql, params, tema)
            return False
        except psycopg.Error as e:
            return contiene.lower() in str(e).lower()


# ---------------------------------------------------------------- preparación
with conectar() as c:
    c.execute("drop database if exists prueba_eyj")
    c.execute("drop role if exists anon, authenticated, service_role, supabase_auth_admin")
    c.execute("create database prueba_eyj")

con = conectar("prueba_eyj")
con.execute(SIMULADO)

# Una cuenta creada ANTES de correr el SQL (el SQL debe crearle el perfil)
A = uuid.uuid4()
con.execute("insert into auth.users (id, email, created_at) values (%s, 'jampier@correo.com', now() - interval '1 day')", (A,))

print("1) El SQL corre sin errores (y dos veces seguidas)")
r = con.execute(ESTRUCTURA)
ok(True, "primera ejecución")
con.execute(ESTRUCTURA)
ok(True, "segunda ejecución (se puede repetir sin dañar nada)")

print("2) Cuentas y perfiles")
ok(con.execute("select nombre from perfiles where id = %s", (A,)).fetchone()[0] == "Jampier", "la cuenta previa recibió su perfil")
B = uuid.uuid4()
con.execute("set role supabase_auth_admin")
con.execute(
    "insert into auth.users (id, email, raw_user_meta_data) values (%s, 'estre@correo.com', %s)",
    (B, json.dumps({"nombre": "Estrellita"})),
)
con.execute("reset role")
ok(con.execute("select nombre from perfiles where id = %s", (B,)).fetchone()[0] == "Estrellita", "la segunda cuenta recibe su perfil al crearse")
con.execute("set role supabase_auth_admin")
try:
    con.execute("insert into auth.users (id, email) values (%s, 'intruso@correo.com')", (uuid.uuid4(),))
    ok(False, "una tercera cuenta debe ser rechazada")
except psycopg.Error as e:
    ok("solo para dos personas" in str(e), "una tercera cuenta es rechazada")
con.execute("reset role")
ok(con.execute("select count(*) from perfiles").fetchone()[0] == 2, "solo existen 2 perfiles")

ja, es, anon = Como(con, A), Como(con, B), Como(con, None, "anon")
X = uuid.uuid4()  # alguien con sesión pero sin perfil (no debería existir, igual se prueba)
intruso = Como(con, X)

print("3) Mensajes: enviar como lo hace la app (upsert que ignora duplicados)")
cid = uuid.uuid4()
INSERTAR = """
  insert into mensajes (client_id, remitente, tipo, contenido, media_path, media_meta, responde_a)
  values (%s, %s, %s, %s, %s, %s, %s)
  on conflict (client_id) do nothing returning id, remitente, creado_en, leido_en
"""
filas = ja(INSERTAR, (cid, A, "texto", "Hola mi amor ❤️", None, None, None))
ok(len(filas) == 1 and filas[0][1] == A, "Jampier envía un texto")
m1 = filas[0][0]
ok(len(ja(INSERTAR, (cid, A, "texto", "Hola mi amor ❤️", None, None, None))) == 0, "reintento con el mismo client_id: no duplica")
ok(len(ja("select id from mensajes where client_id = %s", (cid,))) == 1, "el reintento encuentra el mensaje existente")
filas = ja(INSERTAR, (uuid.uuid4(), B, "texto", "Me hago pasar por ella", None, None, None))
ok(filas[0][1] == A, "no se puede enviar a nombre de la otra persona (el servidor corrige el remitente)")
ok(ja.falla("insert into mensajes (client_id, tipo, contenido, leido_en) values (%s, 'texto', 'x', now())", (uuid.uuid4(),), contiene="permission denied"),
   "no se puede inventar 'leído' al enviar")
ok(ja.falla(INSERTAR, (uuid.uuid4(), A, "texto", "   ", None, None, None), contiene="mensaje_valido"), "no se aceptan mensajes vacíos")
ok(ja.falla(INSERTAR, (uuid.uuid4(), A, "imagen", None, f"{B}/foto.webp", None, None), contiene="no es tuyo"),
   "no se puede usar un archivo de la carpeta de la otra persona")
foto = ja(INSERTAR, (uuid.uuid4(), A, "imagen", "Mira 🌅", f"{A}/foto.webp", json.dumps({"ancho": 1200, "alto": 900}), m1))
ok(len(foto) == 1, "foto con pie y respuesta a otro mensaje")
foto_id = foto[0][0]
ok(len(es(INSERTAR, (uuid.uuid4(), B, "te_extrano", None, None, None, None))) == 1, "Estrellita envía un Te extraño")

print("4) Quién puede leer")
ok(len(es("select id from mensajes")) == 4, "Estrellita ve los 4 mensajes")
ok(anon.falla("select id from mensajes", contiene="permission denied"), "alguien sin sesión no ve nada")
ok(len(intruso("select id from mensajes")) == 0, "una sesión sin perfil no ve mensajes")
ok(intruso.falla(INSERTAR, (uuid.uuid4(), X, "texto", "hola", None, None, None), contiene="row-level security"), "una sesión sin perfil no puede escribir")
ok(len(intruso("select id from perfiles")) == 0, "una sesión sin perfil no ve los perfiles")
ok(len(es("select id from perfiles")) == 2, "los miembros ven los 2 perfiles")

print("5) Entregado, leído, reacciones, editar y borrar")
ok(es.falla("update mensajes set leido_en = now()", contiene="permission denied"), "nadie cambia 'leído' a mano")
es("select marcar_entregados()")
ok(ja("select count(*) from mensajes where remitente = %s and entregado_en is not null", (A,))[0][0] == 3, "entregados ✓✓")
ok(ja("select count(*) from mensajes where remitente = %s and leido_en is not null", (B,))[0][0] == 0, "marcar_entregados no toca los mensajes propios")
es("select marcar_leidos()")
ok(ja("select count(*) from mensajes where remitente = %s and leido_en is not null", (A,))[0][0] == 3, "leídos ✓✓ de color")
ok(anon.falla("select marcar_leidos()", contiene="permission denied"), "sin sesión no se puede marcar leído")
ok(intruso.falla("select marcar_leidos()", contiene="no autorizado"), "una sesión sin perfil no puede marcar leído")
es("select reaccionar(%s, '❤️')", (m1,))
ja("select reaccionar(%s, '😂')", (m1,))
reac = ja("select reacciones from mensajes where id = %s", (m1,))[0][0]
ok(reac == {str(B): "❤️", str(A): "😂"}, "reacciones de los dos guardadas por separado")
ja("select reaccionar(%s, null)", (m1,))
ok(ja("select reacciones from mensajes where id = %s", (m1,))[0][0] == {str(B): "❤️"}, "quitar mi reacción")
ja("select editar_mensaje(%s, 'Hola mi amor 😍')", (m1,))
fila = ja("select contenido, editado_en is not null from mensajes where id = %s", (m1,))[0]
ok(fila == ("Hola mi amor 😍", True), "editar mi mensaje (marca 'editado')")
ok(es.falla("select editar_mensaje(%s, 'hackeado')", (m1,), contiene="ya no se puede editar"), "no se puede editar el mensaje de la otra persona")
con.execute("update mensajes set creado_en = now() - interval '20 minutes' where id = %s", (m1,))
ok(ja.falla("select editar_mensaje(%s, 'tarde')", (m1,), contiene="15 minutos"), "después de 15 minutos ya no se edita")
ok(es.falla("select borrar_mensaje(%s)", (foto_id,), contiene="tus propios"), "no se puede borrar el mensaje de la otra persona")
ruta = ja("select borrar_mensaje(%s)", (foto_id,))[0][0]
ok(ruta == f"{A}/foto.webp", "borrar para los dos devuelve la ruta del archivo")
fila = ja("select borrado, contenido, media_path from mensajes where id = %s", (foto_id,))[0]
ok(fila == (True, None, None), "el mensaje borrado ya no guarda texto ni archivo")
antes = ja("select actualizado_en from mensajes where id = %s", (m1,))[0][0]
es("select reaccionar(%s, '🔥')", (m1,))
ok(ja("select actualizado_en from mensajes where id = %s", (m1,))[0][0] > antes, "cada cambio actualiza 'actualizado_en' (sincronización)")

print("6) Perfiles")
ja("update perfiles set nombre = 'Jampi', notif_con_texto = true where id = %s", (A,))
ok(es("select nombre from perfiles where id = %s", (A,))[0][0] == "Jampi", "cambiar mi nombre")
ok(ja("update perfiles set nombre = 'Cambiado' where id = %s", (B,)) == 0, "no puedo cambiar el nombre de la otra persona")
ok(ja.falla("update perfiles set en_app = true where id = %s", (A,), contiene="permission denied"), "'en línea' solo cambia con el latido")
ja("select latido(true)")
ok(es("select en_app, visto_en is not null from perfiles where id = %s", (A,))[0] == (True, True), "latido: en línea")
ja("select latido(false)")
ok(es("select en_app from perfiles where id = %s", (A,))[0][0] is False, "latido: salió de la app")

print("7) Suscripciones push")
GUARDAR = "select guardar_suscripcion(%s, 'p256dh-x', 'auth-x', 'Chrome Android')"
ja(GUARDAR, ("https://fcm.googleapis.com/fcm/send/abc",))
ja(GUARDAR, ("https://fcm.googleapis.com/fcm/send/abc",))
ok(len(ja("select id from suscripciones_push")) == 1, "guardar dos veces el mismo celular no duplica")
ok(len(es("select id from suscripciones_push")) == 0, "no veo los celulares de la otra persona")
es(GUARDAR, ("https://fcm.googleapis.com/fcm/send/abc",))
ok(len(es("select id from suscripciones_push")) == 1 and len(ja("select id from suscripciones_push")) == 0,
   "si la otra cuenta entra en el mismo celular, el aviso pasa a ella")
ok(es.falla(GUARDAR, ("http://inseguro.com/x",), contiene="check"), "solo se aceptan direcciones https")
ok(ja("delete from suscripciones_push") == 0, "no puedo borrar los celulares de la otra persona")
ok(es("delete from suscripciones_push where endpoint like 'https://fcm%%'") == 1, "puedo borrar el mío")
ok(intruso.falla(GUARDAR, ("https://fcm.googleapis.com/x",), contiene="no autorizado"), "una sesión sin perfil no registra celulares")
ok(es.falla("insert into suscripciones_push (endpoint, p256dh, auth) values ('https://a', 'b', 'c')", contiene="permission denied"),
   "la tabla no se escribe directo (solo con la función segura)")

print("8) Canal privado de tiempo real")
EMITIR = "insert into realtime.messages (topic, extension, payload) values (%s, %s, '{}')"
ok(ja(EMITIR, ("pareja-eyj", "broadcast"), tema="pareja-eyj") == 1, "Jampier puede emitir 'escribiendo…' en su canal")
ok(es(EMITIR, ("pareja-eyj", "presence"), tema="pareja-eyj") == 1, "Estrellita puede emitir 'en línea'")
ok(ja.falla(EMITIR, ("otro-canal", "broadcast"), tema="otro-canal", contiene="row-level security"), "no se puede usar otro canal privado")
ok(intruso.falla(EMITIR, ("pareja-eyj", "broadcast"), tema="pareja-eyj", contiene="row-level security"), "una sesión sin perfil no entra al canal")
ok(len(es("select id from realtime.messages", tema="pareja-eyj")) == 2, "los miembros escuchan el canal")
ok(len(intruso("select id from realtime.messages", tema="pareja-eyj")) == 0, "una sesión sin perfil no escucha nada")
pub = con.execute("select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'mensajes'").fetchone()[0]
ok(pub == 1, "la tabla mensajes está en tiempo real (una sola vez)")

print("9) Fotos y notas de voz (bucket privado)")
b = con.execute("select public, file_size_limit from storage.buckets where id = 'media'").fetchone()
ok(b == (False, 15728640), "bucket 'media' privado con límite de 15 MB")
SUBIR = "insert into storage.objects (bucket_id, name) values ('media', %s)"
ok(ja(SUBIR, (f"{A}/{uuid.uuid4()}.webp",)) == 1, "subo a mi carpeta")
ok(ja.falla(SUBIR, (f"{B}/robado.webp",), contiene="row-level security"), "no puedo subir a la carpeta de la otra persona")
ok(ja.falla(SUBIR, ("suelto.webp",), contiene="row-level security"), "no se puede subir fuera de una carpeta")
ok(intruso.falla(SUBIR, (f"{X}/x.webp",), contiene="row-level security"), "una sesión sin perfil no sube archivos")
ok(len(es("select name from storage.objects where bucket_id = 'media'")) == 1, "la otra persona puede ver mis fotos")
ok(len(intruso("select name from storage.objects")) == 0, "una sesión sin perfil no ve fotos")
ok(es("delete from storage.objects where bucket_id = 'media'") == 0, "la otra persona no puede borrar mis fotos")
ok(ja("delete from storage.objects where bucket_id = 'media'") == 1, "yo sí puedo borrar las mías")

print("10) Lo que nadie de afuera puede hacer")
ok(anon("select ping()")[0][0] == "ok", "el despertador (ping) responde sin sesión")
for f in ["latido(true)", "marcar_entregados()", "reaccionar(gen_random_uuid(), '❤️')", "borrar_mensaje(gen_random_uuid())",
          "guardar_suscripcion('https://x', 'a', 'b')", "privado.es_miembro()", "crear_perfil()", "tocar_actualizado()"]:
    ok(anon.falla(f"select {f}", contiene="permission denied"), f"sin sesión no se puede llamar {f.split('(')[0]}")
ok(ja.falla("select crear_perfil()", contiene="permission denied"), "las funciones internas no se llaman desde la app")
ok(anon.falla("select * from perfiles", contiene="permission denied"), "sin sesión no se ven perfiles")
ok(anon.falla("select * from suscripciones_push", contiene="permission denied"), "sin sesión no se ven celulares")

print("11) Protección: no se puede borrar una cuenta que tiene mensajes")
try:
    con.execute("delete from auth.users where id = %s", (B,))
    ok(False, "borrar la cuenta de Estrellita debe fallar (tiene mensajes)")
except psycopg.Error as e:
    ok("foreign key" in str(e).lower() or "violates" in str(e).lower(), "borrar una cuenta con mensajes es rechazado: la conversación queda a salvo")
ok(con.execute("select count(*) from mensajes where remitente = %s", (B,)).fetchone()[0] > 0, "sus mensajes siguen ahí")
ok(con.execute("select count(*) from perfiles").fetchone()[0] == 2, "y su perfil también")
# Una cuenta SIN mensajes sí se puede borrar (por ejemplo, si se creó mal)
con.execute("delete from mensajes where remitente = %s", (B,))
con.execute("delete from auth.users where id = %s", (B,))
ok(con.execute("select count(*) from perfiles").fetchone()[0] == 1, "una cuenta sin mensajes sí se puede borrar")
con.execute("set role supabase_auth_admin")
B2 = uuid.uuid4()
con.execute("insert into auth.users (id, email) values (%s, 'estre@correo.com')", (B2,))
con.execute("reset role")
ok(con.execute("select count(*) from perfiles").fetchone()[0] == 2, "y entonces se puede crear de nuevo la segunda cuenta")

print("12) Plantilla para poner una contraseña nueva (02_nueva_contrasena.sql)")
plantilla = Path(sys.argv[5]).read_text()
con.execute(plantilla.replace("ESCRIBE-AQUI-LA-NUEVA", "Clave-Nueva-2026").replace("correo@ejemplo.com", "  Estre@Correo.com "))
hash_ = con.execute("select encrypted_password from auth.users where id = %s", (B2,)).fetchone()[0]
ok(hash_ is not None and hash_.startswith("$2a$10$"), f"guarda un hash bcrypt como el de Supabase ({hash_[:7]}…)")
ok(con.execute("select extensions.crypt('Clave-Nueva-2026', %s) = %s", (hash_, hash_)).fetchone()[0], "la contraseña nueva coincide con el hash")
res = con.execute(plantilla.replace("ESCRIBE-AQUI-LA-NUEVA", "x").replace("correo@ejemplo.com", "nadie@correo.com")).fetchone()[0]
ok(res.startswith("No encontré"), "si el correo no existe, lo dice claro")
try:
    import bcrypt  # mismo algoritmo que usa Supabase Auth para verificar
    ok(bcrypt.checkpw(b"Clave-Nueva-2026", hash_.encode()), "un verificador bcrypt independiente acepta la contraseña")
except ImportError:
    print("  (bcrypt de Python no está instalado; se omite la verificación independiente)")

con.close()
print(f"\n{pruebas - len(fallos)}/{pruebas} pruebas superadas")
if fallos:
    print("FALLARON:\n - " + "\n - ".join(fallos))
    sys.exit(1)
