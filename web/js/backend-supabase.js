/* ==========================================================================
   backend-supabase.js — Conexión real con Supabase
   --------------------------------------------------------------------------
   · Login con correo y contraseña (solo existen 2 cuentas).
   · Mensajes en la tabla "mensajes" protegidos con reglas RLS.
   · Fotos y notas de voz en el bucket privado "media" (URLs firmadas).
   · Tiempo real: canal PRIVADO "pareja-eyj" con cambios de la tabla,
     presencia (en línea) y "escribiendo…".
   · Notificaciones: llama a la Edge Function "enviar-push".
   ========================================================================== */
import { CONFIG } from './config.js';
import { kv } from './almacen.js';
import { esErrorDeRed, textoRechazoPin } from './utilidades.js';

const CLAVE_SESION = 'eyj-sesion';
const TEMA_CANAL = 'pareja-eyj';
const VIGENCIA_URL_S = 6 * 3600;

function revisar({ data, error }) {
  if (error) throw error;
  return data;
}

function traducirErrorAuth(error) {
  const m = String(error?.message || '').toLowerCase();
  if (m.includes('expired') || m.includes('invalid')) return 'El pase para entrar venció. Escribe el PIN otra vez.';
  if (m.includes('email not confirmed'))
    return 'Esta cuenta aún no está confirmada. En Supabase → Authentication → Users, créala marcando "Auto Confirm User".';
  if (m.includes('rate') || error?.status === 429) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  if (esErrorDeRed(error)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
  return `No se pudo entrar: ${error?.message || 'error desconocido'}.`;
}

function cargarScript(src) {
  return new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolver;
    s.onerror = () => rechazar(new Error('No se pudo cargar la conexión. Revisa tu internet.'));
    document.head.appendChild(s);
  });
}

export class BackendSupabase {
  constructor() {
    this.modo = 'supabase';
    this.sb = null;
    this.usuario = null;
    this.token = null;
    this.canal = null;
    this.cb = {};
    this.visible = document.visibilityState === 'visible';
    this.cacheUrls = new Map();
    this.colaUrls = [];
    this.temporizadorUrls = null;
  }

  /* ---------- Sesión ---------- */
  async iniciar() {
    if (!window.supabase?.createClient) await cargarScript('js/vendor/supabase.js');
    this.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: CLAVE_SESION },
    });

    this.sb.auth.onAuthStateChange((evento, sesion) => {
      if (sesion?.user) {
        this.usuario = sesion.user;
        this.token = sesion.access_token;
      }
      if (evento === 'SIGNED_OUT') {
        this.usuario = null;
        this.token = null;
        this.alSalir?.();
      }
    });

    const { data, error } = await this.sb.auth.getSession();
    let usuario = data?.session?.user ?? null;
    this.token = data?.session?.access_token ?? null;
    if (!usuario && error) {
      // Sin internet y con el token vencido: se sigue con la sesión guardada
      // (los mensajes guardados se ven y todo se sincroniza al volver la señal).
      try {
        usuario = JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null')?.user ?? null;
      } catch {
        usuario = null;
      }
    }
    this.usuario = usuario;

    const urlsGuardadas = await kv.leer('urls-firmadas');
    if (urlsGuardadas) for (const [ruta, v] of Object.entries(urlsGuardadas)) this.cacheUrls.set(ruta, v);
    return this.usuario;
  }

  /**
   * Entra con usuario + PIN:
   *  1. La función "entrar-con-pin" revisa el PIN en el servidor (con bloqueo
   *     por intentos) y devuelve un pase de un solo uso.
   *  2. Ese pase se cambia aquí por la sesión.
   * @returns {Promise<{usuario: object, version: number}>}
   */
  async entrar(usuario, pin) {
    const { data, error } = await this.sb.functions.invoke('entrar-con-pin', { body: { usuario, pin } });
    if (error) {
      const estado = error.context?.status;
      if (estado === 404) throw new Error('Falta publicar la función «entrar-con-pin» en Supabase (paso 6 de la guía).');
      if (estado === 401) throw new Error('En Supabase, apaga «Verify JWT» en la función «entrar-con-pin» (paso 6 de la guía).');
      if (error.name === 'FunctionsFetchError' || esErrorDeRed(error)) throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      throw new Error('El servidor no respondió bien. Inténtalo de nuevo en un momento.');
    }
    if (!data?.ok || !data.token_hash) throw new Error(textoRechazoPin(data));

    const { data: sesion, error: errorSesion } = await this.sb.auth.verifyOtp({ token_hash: data.token_hash, type: 'email' });
    if (errorSesion || !sesion?.user) throw new Error(traducirErrorAuth(errorSesion));
    this.usuario = sesion.user;
    this.token = sesion.session?.access_token ?? null;
    return { usuario: sesion.user, version: data.version ?? 1 };
  }

  /** Cambia el PIN de los dos. Devuelve la versión nueva. */
  async cambiarPin(actual, nuevo) {
    const { data, error } = await this.sb.rpc('cambiar_pin', { p_actual: actual, p_nuevo: nuevo });
    if (error) {
      if (esErrorDeRed(error)) throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
      throw new Error(error.message || 'No se pudo cambiar el PIN.');
    }
    if (!data?.ok) throw new Error(data?.motivo === 'datos' ? 'El PIN actual no es correcto.' : textoRechazoPin(data));
    return data.version;
  }

  /** Versión del PIN en el servidor (null si no hay señal). */
  async versionPin() {
    try {
      const { data, error } = await this.sb.rpc('version_pin');
      return error ? null : (data ?? null);
    } catch {
      return null;
    }
  }

  async salir() {
    await this.desconectarTiempoReal();
    await this.sb.auth.signOut().catch(() => {});
    this.usuario = null;
    this.token = null;
    await kv.borrar('urls-firmadas');
    this.cacheUrls.clear();
  }

  usuarioActual() {
    return this.usuario;
  }

  /* ---------- Perfiles ---------- */
  async cargarPerfiles() {
    return revisar(await this.sb.from('perfiles').select('id, usuario, nombre, avatar_path, notif_con_texto, en_app, visto_en'));
  }

  async actualizarMiPerfil(campos) {
    revisar(await this.sb.from('perfiles').update(campos).eq('id', this.usuario.id));
  }

  /** Avisa que sigo en la app (o que ya salí). La hora la pone el servidor. */
  async latido(enApp) {
    if (!this.usuario) return;
    try {
      await this.sb.rpc('latido', { p_en_app: enApp });
    } catch {
      /* sin conexión: no pasa nada */
    }
  }

  /** Versión que sobrevive al cerrar la app (fetch con keepalive). */
  latidoAlSalir() {
    if (!this.token) return;
    try {
      fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/latido`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: CONFIG.SUPABASE_KEY,
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_en_app: false }),
      }).catch(() => {});
    } catch {
      /* nada */
    }
  }

  /* ---------- Mensajes ---------- */
  async cargarMensajes({ antesDe = null, limite = 50 } = {}) {
    let consulta = this.sb.from('mensajes').select('*').order('creado_en', { ascending: false }).limit(limite);
    if (antesDe) consulta = consulta.lt('creado_en', antesDe);
    return revisar(await consulta);
  }

  /** Todo lo que cambió (nuevo, editado, leído, reacciones…) desde una fecha. */
  async sincronizar(desde) {
    return revisar(
      await this.sb.from('mensajes').select('*').gt('actualizado_en', desde).order('actualizado_en', { ascending: true }).limit(1000),
    );
  }

  /** Guarda un mensaje. Si ya existía (reintento), devuelve el que estaba. */
  async enviarMensaje(fila) {
    const insertados = revisar(
      await this.sb.from('mensajes').upsert(fila, { onConflict: 'client_id', ignoreDuplicates: true }).select(),
    );
    if (insertados?.length) return insertados[0];
    return revisar(await this.sb.from('mensajes').select('*').eq('client_id', fila.client_id).single());
  }

  /* ---------- Fotos y audios ---------- */
  async subirMedia(blob, ruta, tipo) {
    revisar(await this.sb.storage.from('media').upload(ruta, blob, { contentType: tipo, upsert: true, cacheControl: '31536000' }));
    return ruta;
  }

  /** URL temporal para ver un archivo privado (se piden en grupo). */
  urlFirmada(ruta) {
    if (!ruta) return Promise.resolve(null);
    const guardada = this.cacheUrls.get(ruta);
    if (guardada && guardada.vence - Date.now() > 10 * 60000) return Promise.resolve(guardada.url);
    return new Promise((resolver) => {
      this.colaUrls.push({ ruta, resolver });
      if (!this.temporizadorUrls) this.temporizadorUrls = setTimeout(() => this._firmarCola(), 25);
    });
  }

  async _firmarCola() {
    const cola = this.colaUrls;
    this.colaUrls = [];
    this.temporizadorUrls = null;
    const rutas = [...new Set(cola.map((c) => c.ruta))];
    try {
      const datos = revisar(await this.sb.storage.from('media').createSignedUrls(rutas, VIGENCIA_URL_S));
      for (const d of datos || []) {
        if (d?.signedUrl && !d.error) this.cacheUrls.set(d.path, { url: d.signedUrl, vence: Date.now() + VIGENCIA_URL_S * 1000 });
      }
      kv.guardar('urls-firmadas', Object.fromEntries(this.cacheUrls));
    } catch (error) {
      console.warn('No se pudieron firmar las URLs de los archivos:', error);
    }
    // Sin conexión se usa la última URL conocida: el service worker la sirve desde su caché.
    for (const c of cola) c.resolver(this.cacheUrls.get(c.ruta)?.url ?? null);
  }

  async borrarMedia(ruta) {
    if (!ruta) return;
    try {
      await this.sb.storage.from('media').remove([ruta]);
    } catch {
      /* si falla, solo queda el archivo huérfano */
    }
  }

  /* ---------- Acciones sobre mensajes (funciones SQL seguras) ---------- */
  async marcarEntregados() {
    revisar(await this.sb.rpc('marcar_entregados'));
  }

  async marcarLeidos() {
    revisar(await this.sb.rpc('marcar_leidos'));
  }

  async reaccionar(id, emoji) {
    revisar(await this.sb.rpc('reaccionar', { p_mensaje: id, p_emoji: emoji || null }));
  }

  async editar(id, texto) {
    revisar(await this.sb.rpc('editar_mensaje', { p_mensaje: id, p_texto: texto }));
  }

  async borrar(id) {
    const ruta = revisar(await this.sb.rpc('borrar_mensaje', { p_mensaje: id }));
    if (ruta) await this.borrarMedia(ruta);
  }

  async buscar(texto) {
    const patron = `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return revisar(
      await this.sb
        .from('mensajes')
        .select('*')
        .eq('borrado', false)
        .ilike('contenido', patron)
        .order('creado_en', { ascending: false })
        .limit(60),
    );
  }

  /* ---------- Notificaciones ---------- */
  async notificarPush(mensajeId) {
    const { error } = await this.sb.functions.invoke('enviar-push', { body: { mensaje_id: mensajeId } });
    if (error) throw error;
  }

  /** Registra este celular para recibir avisos (si el celular era de la otra cuenta, pasa a esta). */
  async guardarSuscripcion(datos) {
    revisar(
      await this.sb.rpc('guardar_suscripcion', {
        p_endpoint: datos.endpoint,
        p_p256dh: datos.p256dh,
        p_auth: datos.auth,
        p_dispositivo: navigator.userAgent.slice(0, 200),
      }),
    );
  }

  async borrarSuscripcion(endpoint) {
    if (!endpoint) return;
    try {
      await this.sb.from('suscripciones_push').delete().eq('endpoint', endpoint);
    } catch {
      /* nada */
    }
  }

  /* ---------- Tiempo real ---------- */
  conectarTiempoReal(callbacks) {
    this.cb = callbacks;
    this._crearCanal(this.canalPrivadoFallo !== true);
  }

  _crearCanal(privado) {
    if (this.canal) {
      this.sb.removeChannel(this.canal);
      this.canal = null;
    }
    const config = privado ? { private: true, presence: { key: this.usuario.id }, broadcast: { self: false } } : {};
    const canal = this.sb.channel(privado ? TEMA_CANAL : `${TEMA_CANAL}-cambios`, { config });
    this.canalPrivado = privado;

    canal.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (p) => this.cb.onMensaje?.(p.new));
    canal.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes' }, (p) => this.cb.onMensaje?.(p.new));
    if (privado) {
      canal.on('presence', { event: 'sync' }, () => this.cb.onPresencia?.(Object.keys(canal.presenceState())));
      canal.on('broadcast', { event: 'escribiendo' }, ({ payload }) => this.cb.onEscribiendo?.(payload));
    }

    canal.subscribe((estado, error) => {
      this.cb.onEstado?.(estado);
      if (estado === 'SUBSCRIBED' && privado && this.visible) canal.track({ t: Date.now() }).catch(() => {});
      if (estado === 'CHANNEL_ERROR' && privado && /unauthori|denied|permission|policy|private/i.test(String(error?.message ?? error ?? ''))) {
        // Las políticas de realtime.messages no están: se sigue sin presencia ni "escribiendo".
        console.warn('Canal privado no autorizado. Revisa el paso de Realtime en el README.', error);
        this.canalPrivadoFallo = true;
        this._crearCanal(false);
      }
    });
    this.canal = canal;
  }

  async presencia(visible) {
    this.visible = visible;
    if (!this.canal || !this.canalPrivado || this.canal.state !== 'joined') return;
    try {
      if (visible) await this.canal.track({ t: Date.now() });
      else await this.canal.untrack();
    } catch {
      /* nada */
    }
  }

  enviarEscribiendo(tipo = 'escribiendo') {
    if (!this.canal || !this.canalPrivado || this.canal.state !== 'joined') return;
    this.canal.send({ type: 'broadcast', event: 'escribiendo', payload: { de: this.usuario.id, tipo } }).catch(() => {});
  }

  tiempoRealActivo() {
    return this.canal?.state === 'joined';
  }

  /** Al volver a la app: si el canal se cayó (pasa en el celular), se crea de nuevo. */
  reconectar() {
    if (!this.usuario) return;
    if (!this.tiempoRealActivo()) this._crearCanal(this.canalPrivadoFallo !== true);
  }

  async desconectarTiempoReal() {
    if (this.canal) {
      await this.sb.removeChannel(this.canal).catch(() => {});
      this.canal = null;
    }
  }
}
