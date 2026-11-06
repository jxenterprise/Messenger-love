"""Prueba de la app en modo demo con Chrome real (celular y computador)."""
import os
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

# Usa Chrome si CHROME apunta a él (recomendado para el micrófono falso); si no, el Chromium de Playwright
NAVEGADOR = {"executable_path": os.environ["CHROME"]} if os.environ.get("CHROME") else {}

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"
SALIDA = Path(sys.argv[2] if len(sys.argv) > 2 else "capturas")
SALIDA.mkdir(parents=True, exist_ok=True)
errores = []


async def pin(pagina, digitos):
    for d in digitos:
        await pagina.click(f'#teclado [data-digito="{d}"]')
        await pagina.wait_for_timeout(60)


async def main():
    async with async_playwright() as p:
        navegador = await p.chromium.launch(
            **NAVEGADOR,
            args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
        )
        contexto = await navegador.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
            color_scheme="light",
            locale="es-CO",
            timezone_id="America/Bogota",
        )
        await contexto.grant_permissions(["microphone", "notifications"], origin=URL.rstrip("/"))
        pagina = await contexto.new_page()
        pagina.on("console", lambda m: errores.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
        pagina.on("pageerror", lambda e: errores.append(f"[pageerror] {e}"))

        await pagina.goto(URL, wait_until="networkidle")
        await pagina.wait_for_selector("#pantalla-entrada:not([hidden])")
        await pagina.screenshot(path=SALIDA / "01-entrada.png")

        await pagina.click('[data-demo="jampier"]')
        await pagina.wait_for_selector("#paso-nombre:not([hidden])")
        await pagina.screenshot(path=SALIDA / "02-nombre.png")
        await pagina.fill("#nombre-propio", "Jampier")
        await pagina.click("#continuar-nombre")
        await pagina.wait_for_selector("#teclado:not([hidden])")
        await pin(pagina, "12")
        await pagina.screenshot(path=SALIDA / "03-pin.png")
        await pin(pagina, "34")
        await pagina.wait_for_timeout(500)
        await pin(pagina, "1234")
        await pagina.wait_for_selector("#pantalla-chat:not([hidden])")
        await pagina.wait_for_timeout(2200)
        await pagina.screenshot(path=SALIDA / "04-chat-claro.png")

        # Enviar un mensaje y esperar la respuesta simulada
        await pagina.fill("#entrada-mensaje", "Hola mi amor, ¿cómo vas? www.ejemplo.com")
        await pagina.click("#boton-principal")
        await pagina.wait_for_timeout(7000)
        await pagina.screenshot(path=SALIDA / "05-respuesta.png")

        # Emoji de amor (lluvia de corazones)
        await pagina.fill("#entrada-mensaje", "❤️")
        await pagina.click("#boton-principal")
        await pagina.wait_for_timeout(700)
        await pagina.screenshot(path=SALIDA / "06-lluvia.png")
        await pagina.wait_for_timeout(5000)

        # Menú de un mensaje (clic derecho equivale al toque largo de Android)
        filas = await pagina.query_selector_all("#mensajes .fila.suya")
        await filas[-1].click(button="right")
        await pagina.wait_for_selector(".hoja")
        await pagina.screenshot(path=SALIDA / "07-menu-mensaje.png")
        await pagina.click('.hoja [data-accion="responder"]')
        await pagina.wait_for_timeout(300)
        await pagina.screenshot(path=SALIDA / "08-respondiendo.png")
        await pagina.fill("#entrada-mensaje", "Te respondo a esto 😘")
        await pagina.click("#boton-principal")
        await pagina.wait_for_timeout(1500)

        # Nota de voz (micrófono falso de Chrome)
        await pagina.click("#boton-principal")
        await pagina.wait_for_timeout(2600)
        await pagina.screenshot(path=SALIDA / "09-grabando.png")
        await pagina.click("#enviar-grabacion")
        await pagina.wait_for_timeout(1800)

        # Foto
        await pagina.set_input_files("#selector-fotos", str(Path(sys.argv[3])))
        await pagina.wait_for_selector(".previa-fotos")
        await pagina.fill("#pie-foto", "Mira esta foto 🌅")
        await pagina.screenshot(path=SALIDA / "10-previa-foto.png")
        await pagina.click(".previa-fotos [data-enviar]")
        await pagina.wait_for_timeout(2500)
        await pagina.screenshot(path=SALIDA / "11-con-foto.png")

        # La pareja manda un "Te extraño" sorpresa (~26 s después de abrir el chat)
        try:
            await pagina.wait_for_selector(".capa-te-extrano", timeout=30000)
            await pagina.wait_for_timeout(900)
            await pagina.screenshot(path=SALIDA / "14-te-extrano-recibido.png")
            await pagina.click(".capa-te-extrano [data-cerrar]")
            await pagina.wait_for_timeout(400)
        except Exception as e:  # noqa: BLE001
            errores.append(f"[prueba] no llegó el Te extraño: {e}")

        # Te extraño
        await pagina.click("#boton-te-extrano")
        await pagina.wait_for_timeout(1200)
        await pagina.screenshot(path=SALIDA / "12-te-extrano-enviado.png")

        # Modo oscuro con el botón
        await pagina.click("#boton-tema")
        await pagina.wait_for_timeout(600)
        await pagina.screenshot(path=SALIDA / "13-chat-oscuro.png")

        # Ajustes
        await pagina.click("#boton-menu")
        await pagina.wait_for_selector('.hoja [data-accion="ajustes"]')
        await pagina.click('.hoja [data-accion="ajustes"]')
        await pagina.wait_for_selector(".panel")
        await pagina.wait_for_timeout(400)
        await pagina.screenshot(path=SALIDA / "15-ajustes-oscuro.png", full_page=True)
        await pagina.click('.panel [data-cerrar]')
        await pagina.wait_for_timeout(300)

        # Búsqueda
        await pagina.click("#boton-menu")
        await pagina.click('.hoja [data-accion="buscar"]')
        await pagina.wait_for_selector("#texto-busqueda")
        await pagina.fill("#texto-busqueda", "amor")
        await pagina.wait_for_timeout(900)
        await pagina.screenshot(path=SALIDA / "16-busqueda.png")
        await pagina.click(".resultado")
        await pagina.wait_for_timeout(1200)

        # Volver a claro y bloquear con PIN
        await pagina.click("#boton-tema")
        await pagina.click("#boton-menu")
        await pagina.click('.hoja [data-accion="bloquear"]')
        await pagina.wait_for_selector("#teclado:not([hidden])")
        await pagina.screenshot(path=SALIDA / "17-bloqueado.png")
        await pin(pagina, "9999")
        await pagina.wait_for_timeout(600)
        await pagina.screenshot(path=SALIDA / "18-pin-incorrecto.png")
        await pin(pagina, "1234")
        await pagina.wait_for_selector("#pantalla-chat:not([hidden])")

        # Computador
        escritorio = await navegador.new_context(viewport={"width": 1280, "height": 800}, color_scheme="dark", locale="es-CO")
        pagina2 = await escritorio.new_page()
        pagina2.on("pageerror", lambda e: errores.append(f"[pageerror-pc] {e}"))
        pagina2.on("console", lambda m: errores.append(f"[pc {m.type}] {m.text}") if m.type in ("error",) else None)
        await pagina2.goto(URL, wait_until="networkidle")
        await pagina2.click('[data-demo="estrellita"]')
        await pagina2.click("#continuar-nombre")
        for d in "2468":
            await pagina2.keyboard.press(d)
        await pagina2.wait_for_timeout(400)
        for d in "2468":
            await pagina2.keyboard.press(d)
        await pagina2.wait_for_selector("#pantalla-chat:not([hidden])")
        await pagina2.wait_for_timeout(1800)
        await pagina2.hover("#mensajes .fila.mia .burbuja >> nth=-1")
        await pagina2.screenshot(path=SALIDA / "19-pc-oscuro.png")
        await pagina2.click("#boton-emojis")
        await pagina2.wait_for_timeout(300)
        await pagina2.screenshot(path=SALIDA / "20-pc-emojis.png")

        await navegador.close()

    print("\n".join(errores) if errores else "SIN ERRORES EN CONSOLA")


asyncio.run(main())
