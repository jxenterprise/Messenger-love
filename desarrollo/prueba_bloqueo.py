"""Prueba corta: el PIN debe tapar por completo el chat."""
import os
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

# Usa Chrome si CHROME apunta a él (recomendado para el micrófono falso); si no, el Chromium de Playwright
NAVEGADOR = {"executable_path": os.environ["CHROME"]} if os.environ.get("CHROME") else {}

URL = sys.argv[1]
SALIDA = Path(sys.argv[2])
SALIDA.mkdir(parents=True, exist_ok=True)


async def main():
    errores = []
    async with async_playwright() as p:
        nav = await p.chromium.launch(**NAVEGADOR)
        ctx = await nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="es-CO")
        pag = await ctx.new_page()
        pag.on("pageerror", lambda e: errores.append(str(e)))
        pag.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
        await pag.goto(URL, wait_until="networkidle")
        await pag.click('[data-demo="estrellita"]')
        await pag.click("#continuar-nombre")
        for _ in range(2):
            for d in "1111":
                await pag.click(f'#teclado [data-digito="{d}"]')
            await pag.wait_for_timeout(500)
        await pag.wait_for_selector("#pantalla-chat:not([hidden])")
        await pag.wait_for_timeout(1500)
        await pag.click("#boton-menu")
        await pag.click('.hoja [data-accion="bloquear"]')
        await pag.wait_for_timeout(700)
        await pag.screenshot(path=SALIDA / "bloqueo.png")
        # El toque en el centro debe caer en la pantalla del PIN, no en el chat
        arriba = await pag.evaluate("document.elementFromPoint(195, 400).closest('section')?.id")
        print("elemento encima:", arriba)
        await nav.close()
    print("errores:", errores or "ninguno")


asyncio.run(main())
