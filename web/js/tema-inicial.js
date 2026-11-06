/* ==========================================================================
   tema-inicial.js — Aplica el tema guardado ANTES de pintar la página,
   para que no se vea un destello claro al abrir en modo oscuro.
   (Es un script clásico y pequeño a propósito: se carga en el <head>.)
   ========================================================================== */
(function () {
  try {
    var tema = JSON.parse(localStorage.getItem('eyj:tema') || '"auto"');
    if (tema === 'claro') document.documentElement.setAttribute('data-theme', 'light');
    else if (tema === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    /* sin almacenamiento: se usa el tema del celular */
  }
})();
