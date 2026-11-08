/* ==========================================================================
   backend-demo.js — "Servidor" de mentira para el MODO DEMO
   --------------------------------------------------------------------------
   Imita exactamente lo que hace backend-supabase.js, pero todo pasa dentro
   del navegador: trae una conversación de ejemplo y la otra persona
   "responde" sola, para que se pueda ver la app funcionando sin conectar
   nada todavía. Ningún mensaje sale del dispositivo.
   ========================================================================== */
import { local } from './almacen.js';
import { esEmojiDeAmor, esperar, textoRechazoPin, uuid } from './utilidades.js';

const PIN_DEMO = '1234';

const USUARIOS = {
  jampier: { id: 'demo-jampier', email: 'jampier@demo.local', nombre: 'Jampier' },
  estrellita: { id: 'demo-estrellita', email: 'estrellita@demo.local', nombre: 'Estrellita' },
};

const RESPUESTAS = [
  'Awww 🥰',
  'Yo también te amo 💜',
  'Jajaja 😂 eres lo máximo',
  'Me encantas, ¿sabías?',
  'Ya quiero verte ❤️',
  'Eres lo mejor que me ha pasado ✨',
  'Siii, de una 😍',
  'Te pienso todo el día 💭',
];

const ONDA_DEMO = [18, 34, 52, 40, 66, 80, 58, 44, 70, 92, 76, 50, 38, 62, 84, 68, 46, 30, 56, 74, 88, 64, 42, 36, 58, 72, 54, 40, 28, 48, 66, 52, 38, 26, 44, 60, 42, 30, 20, 14];

const ahoraIso = () => new Date().toISOString();

export class BackendDemo {
  /** @param {{foto?: string, audio?: string}} activos  Rutas o data: URIs de los archivos de ejemplo. */
  constructor(activos = {}) {
    this.modo = 'demo';
    this.activos = {
      'demo/atardecer.webp': activos.foto || 'img/demo/atardecer.webp',
      'demo/nota-de-voz.m4a': activos.audio || 'img/demo/nota-de-voz.m4a',
    };
    this.urls = new Map(Object.entries(this.activos));
    this.cb = {};
    this.mensajes = [];
    this.perfiles = [];
    this.temporizadores = new Set();
    this.parejaEnLinea = false;
    this.sorpresaHecha = false;
    this.respuestaProgramada = false;
  }

  /* ---------- Sesión ---------- */
  async iniciar() {
    const quien = local.leer('demo:usuario');
    this.usuario = quien && USUARIOS[quien] ? { id: USUARIOS[quien].id, email: USUARIOS[quien].email } : null;
    if (this.usuario) this._sembrar();
    return this.usuario;
  }

  /** PIN de la vista previa (el real nunca puede ser 1234: es muy fácil). */
  pinDemo() {
    return local.leer('demo:pin', PIN_DEMO);
  }

  /** Igual que la app real: usuario + PIN. */
  async entrar(usuario, pin) {
    await esperar(300);
    const clave = String(usuario || '').trim().toLowerCase();
    const u = USUARIOS[clave];
    if (!u || pin !== this.pinDemo()) throw new Error(textoRechazoPin({ motivo: 'datos' }));
    this.usuario = { id: u.id, email: u.email };
    local.guardar('demo:usuario', clave);
    this._sembrar();
    return { usuario: this.usuario, version: this.versionDemo() };
  }

  versionDemo() {
    return local.leer('demo:pin-version', 1);
  }

  async versionPin() {
    return this.versionDemo();
  }

  async cambiarPin(actual, nuevo) {
    await esperar(400);
    if (actual !== this.pinDemo()) throw new Error('El PIN actual no es correcto.');
    if (nuevo === actual) throw new Error('El PIN nuevo es igual al actual.');
    local.guardar('demo:pin', nuevo);
    const version = this.versionDemo() + 1;
    local.guardar('demo:pin-version', version);
    return version;
  }

  async salir() {
    this.desconectarTiempoReal();
    local.borrar('demo:usuario');
    this.usuario = null;
  }

  usuarioActual() {
    return this.usuario;
  }

  _pareja() {
    return this.perfiles.find((p) => p.id !== this.usuario?.id);
  }

  /* ---------- Conversación de ejemplo ---------- */
  _sembrar() {
    const E = USUARIOS.estrellita.id;
    const J = USUARIOS.jampier.id;
    const ahora = Date.now();
    const min = 60000;
    const hora = 60 * min;
    const hace = (ms) => new Date(ahora - ms).toISOString();
    const nombreGuardado = (id, porDefecto) => local.leer(`demo:nombre:${id}`, porDefecto);
    const ajustes = (id) => local.leer(`demo:preferencias:${id}`, {}); // como la columna "preferencias"

    this.perfiles = [
      { id: J, usuario: 'jampier', nombre: nombreGuardado(J, 'Jampier'), avatar_path: null, notif_con_texto: false, preferencias: ajustes(J), en_app: false, visto_en: hace(3 * min) },
      { id: E, usuario: 'estrellita', nombre: nombreGuardado(E, 'Estrellita'), avatar_path: null, notif_con_texto: false, preferencias: ajustes(E), en_app: false, visto_en: hace(3 * min) },
    ];

    const filas = [
      [E, 26 * hora, { contenido: 'Buenos días mi amor ☀️' }],
      [J, 26 * hora - 3 * min, { contenido: 'Buenos días mi vida 💜 ¿Cómo dormiste?' }],
      [E, 26 * hora - 4 * min, { contenido: 'Muy bien, soñé contigo 🙈' }],
      [E, 15 * hora, { tipo: 'imagen', contenido: 'Mira el atardecer de hoy 🌅', media_path: 'demo/atardecer.webp', media_meta: { ancho: 1200, alto: 900 } }, 'foto'],
      [J, 15 * hora - 3 * min, { contenido: 'Qué belleza… pero tú más ❤️', responde: 'foto' }],
      [E, 15 * hora - 4 * min, { tipo: 'audio', media_path: 'demo/nota-de-voz.m4a', media_meta: { duracion: 5, onda: ONDA_DEMO } }],
      [J, 15 * hora - 5 * min, { contenido: 'Jajaja me encantó 😂' }],
      [E, 42 * min, { contenido: '¿A qué hora sales hoy?' }],
      [J, 38 * min, { contenido: 'Como a las 6. ¿Te paso a buscar?', editado: true }],
      [E, 37 * min, { contenido: '¡Siii! 😍', reacciones: { [J]: '❤️' } }],
      [E, 36 * min, { contenido: '❤️' }],
    ];

    const porClave = {};
    this.mensajes = filas.map(([remitente, haceMs, campos, clave]) => {
      const creado = hace(haceMs);
      const m = {
        id: uuid(),
        client_id: uuid(),
        remitente,
        tipo: campos.tipo || 'texto',
        contenido: campos.contenido ?? null,
        media_path: campos.media_path ?? null,
        media_meta: campos.media_meta ?? null,
        responde_a: campos.responde ? porClave[campos.responde] : null,
        reacciones: campos.reacciones || {},
        editado_en: campos.editado ? hace(haceMs - 30000) : null,
        borrado: false,
        entregado_en: hace(haceMs - 5000),
        leido_en: hace(haceMs - 20000),
        creado_en: creado,
        actualizado_en: creado,
      };
      if (clave) porClave[clave] = m.id;
      return m;
    });
  }

  /* ---------- Perfiles ---------- */
  async cargarPerfiles() {
    return this.perfiles.map((p) => ({ ...p }));
  }

  async actualizarMiPerfil(campos) {
    const yo = this.perfiles.find((p) => p.id === this.usuario.id);
    Object.assign(yo, campos);
    if (campos.nombre) local.guardar(`demo:nombre:${yo.id}`, campos.nombre);
    if (campos.preferencias) local.guardar(`demo:preferencias:${yo.id}`, campos.preferencias);
  }

  /** Vaciar el chat (en la vista previa solo dura hasta recargar la página). */
  async vaciarChat() {
    await esperar(300);
    this.mensajes = [];
    this.vaciadoEn = ahoraIso();
    this.vaciadoPor = this.usuario?.id ?? null;
  }

  async estadoChat() {
    return { vaciadoEn: this.vaciadoEn ?? null, vaciadoPor: this.vaciadoPor ?? null };
  }

  async latido(enApp) {
    const yo = this.perfiles.find((p) => p.id === this.usuario?.id);
    if (yo) Object.assign(yo, { en_app: enApp, visto_en: ahoraIso() });
  }

  latidoAlSalir() {
    this.latido(false);
  }

  /* ---------- Mensajes ---------- */
  async cargarMensajes({ antesDe = null, limite = 50 } = {}) {
    await esperar(120);
    const lista = [...this.mensajes]
      .filter((m) => !antesDe || m.creado_en < antesDe)
      .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
      .slice(0, limite);
    return lista.map((m) => ({ ...m }));
  }

  async sincronizar(desde) {
    return this.mensajes.filter((m) => m.actualizado_en > desde).map((m) => ({ ...m }));
  }

  async enviarMensaje(fila) {
    await esperar(220);
    const existente = this.mensajes.find((m) => m.client_id === fila.client_id);
    if (existente) return { ...existente };
    const ahora = ahoraIso();
    const m = {
      id: uuid(),
      client_id: fila.client_id,
      remitente: this.usuario.id,
      tipo: fila.tipo,
      contenido: fila.contenido ?? null,
      media_path: fila.media_path ?? null,
      media_meta: fila.media_meta ?? null,
      responde_a: fila.responde_a ?? null,
      reacciones: {},
      editado_en: null,
      borrado: false,
      entregado_en: null,
      leido_en: null,
      creado_en: ahora,
      actualizado_en: ahora,
    };
    this.mensajes.push(m);
    this._simularRespuesta(m);
    return { ...m };
  }

  async subirMedia(blob, ruta) {
    await esperar(400);
    this.urls.set(ruta, URL.createObjectURL(blob));
    return ruta;
  }

  async urlFirmada(ruta) {
    return this.urls.get(ruta) || null;
  }

  async borrarMedia() {}

  async marcarEntregados() {}

  async marcarLeidos() {
    const ahora = ahoraIso();
    for (const m of this.mensajes) {
      if (m.remitente !== this.usuario.id && !m.leido_en) {
        m.leido_en = ahora;
        m.entregado_en = m.entregado_en || ahora;
        m.actualizado_en = ahora;
      }
    }
  }

  _actualizar(id, cambios) {
    const m = this.mensajes.find((x) => x.id === id);
    if (!m) return null;
    Object.assign(m, cambios, { actualizado_en: ahoraIso() });
    this.cb.onMensaje?.({ ...m });
    return m;
  }

  async reaccionar(id, emoji) {
    const m = this.mensajes.find((x) => x.id === id);
    if (!m) return;
    const reacciones = { ...m.reacciones };
    if (emoji) reacciones[this.usuario.id] = emoji;
    else delete reacciones[this.usuario.id];
    this._actualizar(id, { reacciones });
  }

  async editar(id, texto) {
    const m = this.mensajes.find((x) => x.id === id);
    if (!m || m.remitente !== this.usuario.id) throw new Error('Solo puedes editar tus mensajes.');
    if (Date.now() - Date.parse(m.creado_en) > 15 * 60000) throw new Error('Ya pasaron más de 15 minutos: no se puede editar.');
    this._actualizar(id, { contenido: texto, editado_en: ahoraIso() });
  }

  async borrar(id) {
    const m = this.mensajes.find((x) => x.id === id);
    if (!m || m.remitente !== this.usuario.id) throw new Error('Solo puedes eliminar tus mensajes.');
    this._actualizar(id, { borrado: true, contenido: null, media_path: null, media_meta: null, reacciones: {} });
  }

  async buscar(texto) {
    const t = texto.toLowerCase();
    return this.mensajes
      .filter((m) => !m.borrado && m.contenido && m.contenido.toLowerCase().includes(t))
      .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
      .map((m) => ({ ...m }));
  }

  async notificarPush() {}
  async guardarSuscripcion() {}
  async borrarSuscripcion() {}

  /* ---------- "Tiempo real" simulado ---------- */
  _programar(ms, fn) {
    const t = setTimeout(() => {
      this.temporizadores.delete(t);
      fn();
    }, ms);
    this.temporizadores.add(t);
  }

  _ponerEnLinea(valor) {
    const pareja = this._pareja();
    if (!pareja) return;
    this.parejaEnLinea = valor;
    if (!valor) pareja.visto_en = ahoraIso();
    this.cb.onPresencia?.(valor ? [pareja.id, this.usuario.id] : [this.usuario.id]);
    clearTimeout(this.salidaPareja);
    if (valor) this.salidaPareja = setTimeout(() => this._ponerEnLinea(false), 60000);
  }

  _insertarDePareja(campos) {
    const pareja = this._pareja();
    const ahora = ahoraIso();
    const m = {
      id: uuid(),
      client_id: uuid(),
      remitente: pareja.id,
      tipo: campos.tipo || 'texto',
      contenido: campos.contenido ?? null,
      media_path: null,
      media_meta: null,
      responde_a: campos.responde_a ?? null,
      reacciones: {},
      editado_en: null,
      borrado: false,
      entregado_en: null,
      leido_en: null,
      creado_en: ahora,
      actualizado_en: ahora,
    };
    this.mensajes.push(m);
    this.cb.onMensaje?.({ ...m });
  }

  _respuestaPara(m) {
    if (m.tipo === 'te_extrano') return 'Yo te extraño más 💌';
    if (m.tipo === 'imagen') return '¡Qué linda foto! 😍';
    if (m.tipo === 'audio') return 'Me encanta escuchar tu voz 🥹';
    if (esEmojiDeAmor(m.contenido)) return '💜';
    let r;
    do r = RESPUESTAS[Math.floor(Math.random() * RESPUESTAS.length)];
    while (r === this.ultimaRespuesta && RESPUESTAS.length > 1);
    this.ultimaRespuesta = r;
    return r;
  }

  _simularRespuesta(m) {
    const pareja = this._pareja();
    if (!pareja) return;
    const enLinea = this.parejaEnLinea;
    const base = enLinea ? 0 : 1400;
    if (!enLinea) this._programar(base, () => this._ponerEnLinea(true));
    this._programar(base + 700, () => this._actualizar(m.id, { entregado_en: ahoraIso() }));
    this._programar(base + 1800, () => this._actualizar(m.id, { leido_en: ahoraIso() }));
    if (this.respuestaProgramada) return;
    this.respuestaProgramada = true;
    this._programar(base + 2300, () => this.cb.onEscribiendo?.({ de: pareja.id, tipo: 'escribiendo' }));
    this._programar(base + 3900, () => this.cb.onEscribiendo?.({ de: pareja.id, tipo: 'escribiendo' }));
    this._programar(base + 4800, () => {
      this.respuestaProgramada = false;
      this._insertarDePareja({ contenido: this._respuestaPara(m) });
    });
  }

  conectarTiempoReal(callbacks) {
    this.cb = callbacks;
    this.cb.onEstado?.('SUBSCRIBED');
    this._programar(1500, () => this._ponerEnLinea(true));
    if (!this.sorpresaHecha) {
      this.sorpresaHecha = true;
      // Pasado un rato, la otra persona manda un "Te extraño" para mostrar la función
      this._programar(26000, () => {
        const pareja = this._pareja();
        if (!pareja) return;
        this.cb.onEscribiendo?.({ de: pareja.id, tipo: 'escribiendo' });
        this._programar(1200, () => this._insertarDePareja({ tipo: 'te_extrano' }));
      });
    }
  }

  presencia() {}
  enviarEscribiendo() {}

  tiempoRealActivo() {
    return true;
  }

  reconectar() {}

  desconectarTiempoReal() {
    for (const t of this.temporizadores) clearTimeout(t);
    this.temporizadores.clear();
    clearTimeout(this.salidaPareja);
  }
}
