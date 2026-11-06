// ============================================================================
//  enviar-push — Messenger Estrellita y Jampier ❤️
// ----------------------------------------------------------------------------
//  La app la llama justo después de guardar un mensaje. Esta función:
//    1. Comprueba que quien llama tenga sesión y sea quien envió el mensaje.
//    2. Marca el mensaje como "avisado" (así nunca llega el aviso dos veces).
//    3. Si la pareja tiene la app abierta, no la molesta: ya lo está viendo.
//    4. Cifra el aviso (Web Push, RFC 8291 + VAPID RFC 8292) y lo manda a
//       todos sus celulares. Los celulares que ya no existen se borran solos.
//
//  Secretos que hay que crear en Supabase (Edge Functions → Secrets):
//    VAPID_PUBLIC_KEY   → la clave pública  (la misma de js/config.js)
//    VAPID_PRIVATE_KEY  → la clave privada  (¡solo aquí, nunca en la web!)
//    VAPID_SUBJECT      → mailto:tu-correo@gmail.com
//  Supabase ya trae SUPABASE_URL y las claves internas: no hay que crearlas.
//
//  IMPORTANTE: en los ajustes de la función, apaga "Verify JWT"
//  (esta función ya verifica la sesión por su cuenta, con cualquier tipo de clave).
// ============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Avisos de mensajes con más de 12 horas ya no se mandan (llegarían tarde). */
const MAX_ANTIGUEDAD_MS = 12 * 60 * 60 * 1000;
/** Si la pareja dio señales de vida hace menos de esto y está en la app, no se avisa. */
const VENTANA_ACTIVA_MS = 40 * 1000;
/** Cuánto guarda el servicio de avisos el mensaje si el celular está apagado (1 día). */
const TTL_SEGUNDOS = 24 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codificar = new TextEncoder();

/* ==========================================================================
   Respuestas (con permisos para que la web pueda llamar la función)
   ========================================================================== */
function cabecerasCors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers') ?? 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

function responder(req: Request, cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cabecerasCors(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/* ==========================================================================
   Claves de Supabase (sirve con las claves nuevas sb_secret_… y con las clásicas)
   ========================================================================== */
function claveDeServidor(): string {
  const nuevas = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (nuevas) {
    try {
      const lista = JSON.parse(nuevas) as Record<string, string>;
      const clave = lista.default ?? Object.values(lista)[0];
      if (clave) return clave;
    } catch {
      /* formato inesperado: se usa la clásica */
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

let clienteAdmin: SupabaseClient | null = null;
function admin() {
  clienteAdmin ??= createClient(Deno.env.get('SUPABASE_URL') ?? '', claveDeServidor(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return clienteAdmin;
}

/* ==========================================================================
   Base64url y bytes
   ========================================================================== */
function base64UrlABytes(texto: string) {
  const base = texto.trim().replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

function bytesABase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unir(...partes: Uint8Array[]) {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    total.set(p, i);
    i += p.length;
  }
  return total;
}

/** HKDF-SHA256 (RFC 5869): extrae y expande en un solo paso. */
async function hkdf(sal: BufferSource, ikm: BufferSource, info: BufferSource, largo: number) {
  const clave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, clave, largo * 8);
  return new Uint8Array(bits);
}

/* ==========================================================================
   Cifrado Web Push (RFC 8291, contenido "aes128gcm" de RFC 8188)
   ========================================================================== */
export async function cifrarAviso(texto: string, p256dh: string, auth: string) {
  const publicaCelular = base64UrlABytes(p256dh); // 65 bytes (punto sin comprimir)
  const secretoAuth = base64UrlABytes(auth); // 16 bytes
  if (publicaCelular.length !== 65 || secretoAuth.length !== 16) throw new Error('Suscripción con claves inválidas');

  // Par de claves de un solo uso para este aviso
  const efimera = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const publicaServidor = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const claveCelular = await crypto.subtle.importKey('raw', publicaCelular, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretoCompartido = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: claveCelular }, efimera.privateKey, 256),
  );

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0x00 || clave celular || clave servidor)
  const infoClave = unir(codificar.encode('WebPush: info\0'), publicaCelular, publicaServidor);
  const ikm = await hkdf(secretoAuth, secretoCompartido, infoClave, 32);

  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, codificar.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificar.encode('Content-Encoding: nonce\0'), 12);

  // Un solo registro: texto + 0x02 (delimitador del último registro)
  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const registro = unir(codificar.encode(texto), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, registro));

  // Cabecera: sal (16) | tamaño de registro (4) | largo de la clave (1) | clave del servidor (65)
  const tamanoRegistro = new Uint8Array([0, 0, 0x10, 0x00]); // 4096
  return unir(sal, tamanoRegistro, new Uint8Array([publicaServidor.length]), publicaServidor, cifrado);
}

/* ==========================================================================
   VAPID (RFC 8292): firma que identifica a este servidor ante Google/Apple/Mozilla
   ========================================================================== */
interface Vapid {
  publica: string;
  sujeto: string;
  clave: CryptoKey;
}

let vapidListo: Promise<Vapid> | null = null;
function cargarVapid(): Promise<Vapid> {
  vapidListo ??= (async () => {
    const publica = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').trim();
    const privada = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').trim();
    let sujeto = (Deno.env.get('VAPID_SUBJECT') ?? '').trim();
    if (!publica || !privada || !sujeto) {
      throw new Error('Faltan los secretos VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT en Supabase.');
    }
    // Si escribieron solo el correo, se le pone "mailto:" (Apple lo exige)
    if (!/^(mailto:|https:)/i.test(sujeto)) sujeto = `mailto:${sujeto}`;
    const punto = base64UrlABytes(publica);
    if (punto.length !== 65 || punto[0] !== 4) throw new Error('VAPID_PUBLIC_KEY no es una clave pública válida.');
    const clave = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: bytesABase64Url(punto.slice(1, 33)),
        y: bytesABase64Url(punto.slice(33, 65)),
        d: privada,
        ext: true,
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
    return { publica, sujeto, clave };
  })();
  // Si falló (secretos mal puestos), se vuelve a intentar en la próxima llamada
  vapidListo.catch(() => {
    vapidListo = null;
  });
  return vapidListo;
}

export async function firmaVapid(endpoint: string, vapid: Vapid): Promise<string> {
  const json = (o: unknown) => bytesABase64Url(codificar.encode(JSON.stringify(o)));
  const sinFirmar = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: vapid.sujeto,
  })}`;
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.clave, codificar.encode(sinFirmar)),
  );
  return `${sinFirmar}.${bytesABase64Url(firma)}`;
}

interface Suscripcion {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Resultado {
  ok: boolean;
  caducada: boolean;
  estado: number;
}

async function enviarA(sub: Suscripcion, texto: string, vapid: Vapid): Promise<Resultado> {
  try {
    const cuerpo = await cifrarAviso(texto, sub.p256dh, sub.auth);
    const jwt = await firmaVapid(sub.endpoint, vapid);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${vapid.publica}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SEGUNDOS),
        Urgency: 'high',
      },
      body: cuerpo,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      await res.body?.cancel();
      return { ok: true, caducada: false, estado: res.status };
    }
    const detalle = (await res.text().catch(() => '')).slice(0, 300);
    const servicio = new URL(sub.endpoint).host;
    console.warn(`Aviso rechazado por ${servicio}: ${res.status} ${detalle}`);
    // 404/410: ese celular ya no existe (desinstalaron la app o quitaron el permiso)
    return { ok: false, caducada: res.status === 404 || res.status === 410, estado: res.status };
  } catch (error) {
    console.warn('No se pudo contactar el servicio de avisos:', String(error));
    return { ok: false, caducada: false, estado: 0 };
  }
}

/* ==========================================================================
   Texto del aviso
   ========================================================================== */
interface Mensaje {
  id: string;
  remitente: string;
  tipo: string;
  contenido: string | null;
  media_meta: { duracion?: number } | null;
  borrado: boolean;
  leido_en: string | null;
  creado_en: string;
}

function recortar(texto: string, max: number): string {
  const letras = Array.from(texto.replace(/\s+/g, ' ').trim());
  return letras.length > max ? `${letras.slice(0, max - 1).join('')}…` : letras.join('');
}

function duracion(segundos = 0): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function armarAviso(m: Mensaje, nombre: string, conTexto: boolean, noLeidos: number) {
  let titulo: string;
  let cuerpo: string;
  if (m.tipo === 'te_extrano') {
    titulo = conTexto ? `💌 ${nombre} te extraña` : 'E ❤ J';
    cuerpo = conTexto ? 'Toca para responderle con amor' : 'Alguien está pensando en ti 💭';
  } else if (!conTexto) {
    // Modo discreto: no muestra quién ni qué (por si alguien mira la pantalla)
    titulo = 'E ❤ J';
    cuerpo = noLeidos > 1 ? `Tienes ${noLeidos} mensajes nuevos 💌` : 'Tienes un mensaje nuevo 💌';
  } else {
    titulo = nombre;
    if (m.tipo === 'imagen') cuerpo = m.contenido ? `📷 ${recortar(m.contenido, 160)}` : '📷 Foto';
    else if (m.tipo === 'audio') cuerpo = `🎤 Nota de voz (${duracion(m.media_meta?.duracion)})`;
    else cuerpo = recortar(m.contenido ?? '', 180) || 'Mensaje nuevo';
  }
  return {
    titulo,
    cuerpo,
    tipo: m.tipo,
    tag: 'eyj-chat',
    url: './?origen=aviso',
    no_leidos: noLeidos,
    vibrar: m.tipo === 'te_extrano' ? [180, 90, 180, 90, 420] : [90, 50, 90],
  };
}

/* ==========================================================================
   La función
   ========================================================================== */
export async function manejar(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecerasCors(req) });
  if (req.method !== 'POST') return responder(req, { error: 'Método no permitido' }, 405);

  try {
    // 1) ¿Quién llama?
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token || token.startsWith('sb_')) return responder(req, { error: 'Hace falta iniciar sesión' }, 401);
    const sb = admin();
    const { data: sesion, error: errorSesion } = await sb.auth.getUser(token);
    const usuario = sesion?.user;
    if (errorSesion || !usuario) return responder(req, { error: 'Sesión no válida' }, 401);

    const { mensaje_id: mensajeId } = await req.json().catch(() => ({}));
    if (typeof mensajeId !== 'string' || !UUID.test(mensajeId)) return responder(req, { error: 'Falta mensaje_id' }, 400);

    // 2) Antes de tocar nada, que las claves VAPID estén bien
    let vapid: Vapid;
    try {
      vapid = await cargarVapid();
    } catch (error) {
      console.error(String(error));
      return responder(req, { error: String((error as Error).message ?? error) }, 500);
    }

    // 3) Se "reclama" el aviso: solo el que envió el mensaje, y solo una vez
    const { data: m, error: errorReclamo } = await sb
      .from('mensajes')
      .update({ notificado_en: new Date().toISOString() })
      .eq('id', mensajeId)
      .eq('remitente', usuario.id)
      .is('notificado_en', null)
      .select('id, remitente, tipo, contenido, media_meta, borrado, leido_en, creado_en')
      .maybeSingle<Mensaje>();
    if (errorReclamo) throw errorReclamo;
    if (!m) return responder(req, { ok: true, omitido: 'ya-avisado-o-no-es-tuyo' });
    if (m.borrado || m.leido_en) return responder(req, { ok: true, omitido: 'ya-leido-o-borrado' });
    if (Date.now() - Date.parse(m.creado_en) > MAX_ANTIGUEDAD_MS) return responder(req, { ok: true, omitido: 'muy-antiguo' });

    // 4) ¿Para quién es? ¿Está con la app abierta?
    const { data: perfiles, error: errorPerfiles } = await sb
      .from('perfiles')
      .select('id, nombre, notif_con_texto, en_app, visto_en');
    if (errorPerfiles) throw errorPerfiles;
    const yo = perfiles?.find((p) => p.id === usuario.id);
    const pareja = perfiles?.find((p) => p.id !== usuario.id);
    if (!yo) return responder(req, { error: 'Esta cuenta no pertenece al messenger' }, 403);
    if (!pareja) return responder(req, { ok: true, omitido: 'sin-pareja' });
    const activa = pareja.en_app && pareja.visto_en && Date.now() - Date.parse(pareja.visto_en) < VENTANA_ACTIVA_MS;
    if (activa) return responder(req, { ok: true, omitido: 'pareja-en-la-app' });

    const { data: suscripciones, error: errorSus } = await sb
      .from('suscripciones_push')
      .select('id, endpoint, p256dh, auth')
      .eq('usuario', pareja.id);
    if (errorSus) throw errorSus;
    if (!suscripciones?.length) return responder(req, { ok: true, omitido: 'sin-celulares' });

    // 5) Cuántos mensajes sin leer tiene (para el numerito del ícono)
    const { count } = await sb
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('remitente', usuario.id)
      .eq('borrado', false)
      .is('leido_en', null);
    const noLeidos = Math.max(1, count ?? 1);

    // 6) Enviar a todos sus celulares a la vez
    const aviso = JSON.stringify(armarAviso(m, yo.nombre || 'Tu amor', pareja.notif_con_texto === true, noLeidos));
    const resultados = await Promise.all(suscripciones.map((s) => enviarA(s as Suscripcion, aviso, vapid)));

    const caducadas = suscripciones.filter((_, i) => resultados[i].caducada).map((s) => s.id);
    if (caducadas.length) await sb.from('suscripciones_push').delete().in('id', caducadas);

    const enviados = resultados.filter((r) => r.ok).length;
    const pasajeros = resultados.filter((r) => !r.ok && !r.caducada && (r.estado === 0 || r.estado === 429 || r.estado >= 500));
    if (enviados === 0 && pasajeros.length > 0) {
      // No llegó a ningún celular por un problema pasajero: se libera para que la app reintente
      await sb.from('mensajes').update({ notificado_en: null }).eq('id', m.id);
      return responder(req, { ok: false, error: 'El servicio de avisos no respondió; se reintentará' }, 503);
    }
    return responder(req, { ok: true, enviados, caducadas: caducadas.length, fallidos: resultados.length - enviados });
  } catch (error) {
    console.error('Error en enviar-push:', error);
    return responder(req, { error: 'Error interno al enviar el aviso' }, 500);
  }
}

Deno.serve(manejar);
