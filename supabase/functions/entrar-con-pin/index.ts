// ============================================================================
//  entrar-con-pin — Messenger Estrellita y Jampier ❤️
// ----------------------------------------------------------------------------
//  La pantalla de entrada manda { usuario, pin }. Esta función:
//    1. Le pregunta a la base de datos si el PIN es correcto
//       (verificar_acceso: cuenta los fallos y bloquea; solo el servidor
//       puede llamarla).
//    2. Si es correcto, crea un "pase de un solo uso" para esa cuenta
//       (enlace mágico que NO se envía por correo) y se lo devuelve a la app.
//    3. La app cambia ese pase por la sesión (verifyOtp) y queda adentro.
//
//  No hay que crear secretos: Supabase ya trae SUPABASE_URL y las claves.
//  IMPORTANTE: en los ajustes de la función, apaga "Verify JWT"
//  (quien llama todavía no tiene sesión: viene justamente a entrar).
// ============================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

/* ---------- Respuestas (con permisos para que la web pueda llamarla) ---------- */
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
    headers: { ...cabecerasCors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* ---------- Cliente con la clave del servidor (claves nuevas o clásicas) ---------- */
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
function admin(): SupabaseClient {
  clienteAdmin ??= createClient(Deno.env.get('SUPABASE_URL') ?? '', claveDeServidor(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return clienteAdmin;
}

interface Verificacion {
  ok: boolean;
  motivo?: 'datos' | 'esperar' | 'bloqueado' | 'sin-pin';
  segundos?: number;
  restantes?: number;
  version?: number;
  id?: string;
}

/* ---------- La función ---------- */
export async function manejar(req: Request, sb: SupabaseClient = admin()): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cabecerasCors(req) });
  if (req.method !== 'POST') return responder(req, { error: 'Método no permitido' }, 405);

  try {
    const datos = await req.json().catch(() => ({}));
    const usuario = typeof datos?.usuario === 'string' ? datos.usuario.trim().toLowerCase() : '';
    const pin = typeof datos?.pin === 'string' ? datos.pin.trim() : '';
    if (!/^[a-z0-9._-]{2,30}$/.test(usuario) || !/^[0-9]{4}$/.test(pin)) {
      return responder(req, { ok: false, motivo: 'datos' });
    }

    // 1) ¿PIN correcto? (la base de datos lleva la cuenta de los fallos)
    const { data, error } = await sb.rpc('verificar_acceso', { p_usuario: usuario, p_pin: pin });
    if (error) throw error;
    const v = data as Verificacion;
    if (!v?.ok || !v.id) {
      const { motivo = 'datos', segundos, restantes } = v ?? {};
      return responder(req, { ok: false, motivo, segundos, restantes });
    }

    // 2) Pase de un solo uso para esa cuenta (no se envía ningún correo)
    const { data: cuenta, error: errorCuenta } = await sb.auth.admin.getUserById(v.id);
    if (errorCuenta || !cuenta?.user?.email) throw errorCuenta ?? new Error('La cuenta no tiene correo');
    const { data: enlace, error: errorEnlace } = await sb.auth.admin.generateLink({ type: 'magiclink', email: cuenta.user.email });
    const pase = enlace?.properties?.hashed_token;
    if (errorEnlace || !pase) throw errorEnlace ?? new Error('No se pudo crear el pase');

    return responder(req, { ok: true, token_hash: pase, version: v.version ?? 1 });
  } catch (error) {
    console.error('Error en entrar-con-pin:', error);
    return responder(req, { ok: false, error: 'Error interno al entrar' }, 500);
  }
}

Deno.serve((req) => manejar(req));
