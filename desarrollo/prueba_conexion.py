"""Prueba: qué muestra la app publicada según cómo esté web/js/config.js.

  · Sin datos de Supabase      → pantalla "Casi listo" (nada de mensajes de ejemplo)
  · Con ?demo                  → vista previa con la pareja simulada
  · Con URL + clave pública    → pantalla para entrar con correo y contraseña
  · Con la clave SECRETA       → aviso rojo y la app no la usa

Simula un dominio publicado (eyj.prueba) para que la app no crea que está en
el computador de pruebas (localhost, donde el demo es automático).

Uso (con el servidor de la carpeta web corriendo en el puerto 8765):
    python3 prueba_conexion.py http://127.0.0.1:8765/ capturas
"""
import asyncio
import base64
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

NAVEGADOR = {"executable_path": os.environ["CHROME"]} if os.environ.get("CHROME") else {}

URL_LOCAL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
SALIDA = Path(sys.argv[2] if len(sys.argv) > 2 else "capturas")
SALIDA.mkdir(parents=True, exist_ok=True)
PUERTO = urlparse(URL_LOCAL).port or 80
URL = f"http://eyj.prueba:{PUERTO}/"
CONFIG_JS = (Path(__file__).resolve().parent.parent / "web" / "js" / "config.js").read_text(encoding="utf-8")

fallos = []
total = 0


def revisar(condicion, texto):
    global total
    total += 1
    print(("  ✓ " if condicion else "  ✗ ") + texto)
    if not condicion:
        fallos.append(texto)


def jwt_falso(rol):
    parte = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f'{parte({"alg": "HS256", "typ": "JWT"})}.{parte({"role": rol, "iss": "supabase"})}.firma'


async def visibles(pagina):
    return await pagina.evaluate(
        "[...document.querySelectorAll('section.pantalla')].filter((s) => !s.hidden).map((s) => s.id)"
    )


async def abrir(navegador, ruta="", config=None, oscuro=False):
    """Abre la app; si se pasa config = (url, clave), se reemplaza config.js al vuelo."""
    contexto = await navegador.new_context(
        viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
        locale="es-CO", color_scheme="dark" if oscuro else "light",
    )
    pagina = await contexto.new_page()
    errores = []
    pagina.on("pageerror", lambda e: errores.append(str(e)))
    pagina.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
    # Nada debe salir hacia Supabase en estas pruebas
    await pagina.route("**/*.supabase.co/**", lambda r: r.abort())
    if config:
        url_sb, clave = config
        # Se lee del disco (el dominio de mentira solo existe dentro del navegador)
        texto = CONFIG_JS.replace("SUPABASE_URL: ''", f"SUPABASE_URL: '{url_sb}'").replace(
            "SUPABASE_KEY: ''", f"SUPABASE_KEY: '{clave}'"
        )
        await pagina.route(
            "**/js/config.js",
            lambda r: r.fulfill(status=200, content_type="application/javascript", body=texto),
        )
    await pagina.goto(URL + ruta, wait_until="networkidle")
    await pagina.wait_for_function("!document.querySelector('#pantalla-carga') || document.querySelector('#pantalla-carga').hidden")
    return contexto, pagina, errores


async def main():
    async with async_playwright() as p:
        navegador = await p.chromium.launch(**NAVEGADOR, args=[f"--host-resolver-rules=MAP eyj.prueba 127.0.0.1"])

        print("1) Publicada sin datos de Supabase")
        ctx, pag, err = await abrir(navegador)
        revisar(await visibles(pag) == ["pantalla-conexion"], "muestra solo la pantalla 'Casi listo'")
        revisar(await pag.is_visible("#conexion-pendiente"), "dice que el chat se está preparando")
        revisar(not await pag.is_visible("#conexion-peligro"), "sin aviso de clave secreta")
        revisar(not await pag.is_visible("#caja-demo"), "no aparecen los botones del demo")
        revisar(not await pag.is_visible("#pantalla-chat"), "no hay conversación de ejemplo")
        await pag.screenshot(path=SALIDA / "conexion-claro.png")
        await pag.click(".ayuda-conexion summary")
        await pag.wait_for_timeout(200)
        await pag.screenshot(path=SALIDA / "conexion-ayuda.png", full_page=True)
        revisar(not err, f"sin errores en consola {err or ''}")
        await ctx.close()

        ctx, pag, err = await abrir(navegador, oscuro=True)
        await pag.screenshot(path=SALIDA / "conexion-oscuro.png")
        revisar(not err, "modo oscuro sin errores")
        await ctx.close()

        print("2) El enlace de vista previa (?demo)")
        ctx, pag, err = await abrir(navegador)
        await pag.click("#enlace-demo")
        await pag.wait_for_selector("#caja-demo:not([hidden])")
        revisar(await visibles(pag) == ["pantalla-entrada"], "abre la entrada del demo")
        revisar(not await pag.is_visible("#formulario-entrada"), "en el demo no se pide contraseña")
        revisar(not err, "sin errores en consola")
        await ctx.close()

        print("3) Con URL y clave pública (conectada)")
        ctx, pag, err = await abrir(navegador, config=("  https://abcdefghijkl.supabase.co/rest/v1/ ", "sb_publishable_prueba123"))
        revisar(await visibles(pag) == ["pantalla-entrada"], "muestra la pantalla para entrar")
        revisar(await pag.is_visible("#formulario-entrada"), "pide correo y contraseña")
        revisar(not await pag.is_visible("#caja-demo"), "sin botones del demo")
        url_limpia = await pag.evaluate("import('./js/config.js').then((m) => m.CONFIG.SUPABASE_URL)")
        revisar(url_limpia == "https://abcdefghijkl.supabase.co", f"limpia la URL pegada con /rest/v1/ ({url_limpia})")
        await pag.screenshot(path=SALIDA / "conectada-entrada.png")
        revisar(not err, f"sin errores en consola {err or ''}")
        await ctx.close()

        ctx, pag, err = await abrir(navegador, ruta="?demo", config=("https://abcdefghijkl.supabase.co", "sb_publishable_prueba123"))
        revisar(await pag.is_visible("#formulario-entrada") and not await pag.is_visible("#caja-demo"), "ya conectada, ?demo no activa el demo")
        await ctx.close()

        ctx, pag, err = await abrir(navegador, config=("https://abcdefghijkl.supabase.co", jwt_falso("anon")))
        revisar(await pag.is_visible("#formulario-entrada"), "la clave 'anon' clásica también sirve")
        await ctx.close()

        print("4) Con la clave SECRETA pegada por error")
        for nombre, clave in (("sb_secret_", "sb_secret_abc123"), ("service_role", jwt_falso("service_role"))):
            ctx, pag, err = await abrir(navegador, config=("https://abcdefghijkl.supabase.co", clave))
            revisar(await visibles(pag) == ["pantalla-conexion"], f"{nombre}: no entra a la app")
            revisar(await pag.is_visible("#conexion-peligro"), f"{nombre}: muestra el aviso rojo")
            revisar(not await pag.is_visible("#enlace-demo"), f"{nombre}: sin enlace al demo")
            if nombre == "sb_secret_":
                await pag.screenshot(path=SALIDA / "conexion-clave-secreta.png")
            await ctx.close()
        ctx, pag, err = await abrir(navegador, ruta="?demo", config=("https://abcdefghijkl.supabase.co", "sb_secret_abc123"))
        revisar(await pag.is_visible("#conexion-peligro"), "con la clave secreta, ?demo tampoco abre nada")
        await ctx.close()

        await navegador.close()

    print(f"\n{total - len(fallos)}/{total} pruebas superadas")
    if fallos:
        sys.exit(1)


asyncio.run(main())
