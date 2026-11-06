"""Prueba el nuevo diálogo "Cambiar contraseña" (modo demo) en claro y oscuro."""
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
        for esquema in ("light", "dark"):
            ctx = await nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True,
                                        has_touch=True, locale="es-CO", color_scheme=esquema)
            pag = await ctx.new_page()
            pag.on("pageerror", lambda e: errores.append(str(e)))
            pag.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
            await pag.goto(URL, wait_until="networkidle")
            await pag.click('[data-demo="estrellita"]')
            await pag.click("#continuar-nombre")
            for _ in range(2):
                for d in "1111":
                    await pag.click(f'#teclado [data-digito="{d}"]')
                await pag.wait_for_timeout(450)
            await pag.wait_for_selector("#pantalla-chat:not([hidden])")
            await pag.wait_for_timeout(800)
            await pag.click("#boton-menu")
            await pag.click('.hoja [data-accion="ajustes"]')
            await pag.wait_for_selector(".panel")
            boton = pag.locator('.panel [data-accion="cambiar-clave"]')
            await boton.scroll_into_view_if_needed()
            await pag.wait_for_timeout(300)
            await pag.screenshot(path=SALIDA / f"ajustes-cuenta-{esquema}.png")
            await boton.click()
            await pag.wait_for_selector(".formulario-clave")
            await pag.fill("#clave-nueva", "corta")
            await pag.fill("#clave-repetida", "corta")
            await pag.click('.formulario-clave [type="submit"]')
            e1 = await pag.text_content(".formulario-clave .error-texto")
            await pag.fill("#clave-nueva", "MiClaveSegura2026")
            await pag.fill("#clave-repetida", "MiClaveSegura2027")
            await pag.click('.formulario-clave [type="submit"]')
            e2 = await pag.text_content(".formulario-clave .error-texto")
            await pag.screenshot(path=SALIDA / f"cambiar-clave-{esquema}.png")
            await pag.fill("#clave-repetida", "MiClaveSegura2026")
            await pag.click('.formulario-clave [type="submit"]')
            await pag.wait_for_timeout(900)
            cerrado = await pag.locator(".formulario-clave").count() == 0
            avisos = await pag.text_content("#avisos-flotantes")
            print(f"[{esquema}] corta → '{e1}' | distintas → '{e2}' | válida → diálogo cerrado: {cerrado}, aviso: '{avisos.strip()}'")
            await ctx.close()
        await nav.close()
    print("errores:", errores or "ninguno")


asyncio.run(main())
