import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './server';
import { Db } from '@/lib/db';

export class NoAutenticadoError extends Error {
  constructor() {
    super('Tenés que iniciar sesión.');
  }
}

/**
 * El contexto de datos de la petición: cliente + usuario.
 * Todas las funciones de `lib/db` lo piden, así no hay forma de consultar sin
 * decir de quién son los datos.
 */
export async function requireDb(): Promise<Db> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new NoAutenticadoError();
  return { supabase: supabase as SupabaseClient, userId: data.user.id };
}

/**
 * Envuelve un handler de ruta: traduce la falta de sesión a un 401 y cualquier
 * otro fallo a un 500 con JSON.
 *
 * Lo segundo importa más de lo que parece. Si el handler lanza, Next devuelve
 * una página de error en HTML; el `res.json()` del navegador se atraganta y lo
 * que ve el usuario es el mensaje de parseo de SU navegador, en inglés y sin
 * relación con lo que estaba haciendo — en Safari, "The string did not match
 * the expected pattern". Capturando acá siempre vuelve JSON, y el detalle
 * técnico va al log con una `ref` que el usuario puede dictar.
 */
export async function conSesion(
  fn: (db: Db) => Promise<NextResponse>,
): Promise<NextResponse> {
  let db: Db;
  try {
    db = await requireDb();
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    return await fn(db);
  } catch (err) {
    // Un desfasaje de reloj entre quien firma el token y quien lo valida no es
    // un error: es un segundo de diferencia. Se espera y se reintenta una vez,
    // porque al usuario no le sirve de nada enterarse de esto.
    if (esDesfasajeDeReloj(err)) {
      await new Promise(listo => setTimeout(listo, 1200));
      try {
        return await fn(await requireDb());
      } catch (segundo) {
        err = segundo;
      }
    }

    const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
    console.error(`[api] error ${ref}:`, err);
    return NextResponse.json(
      { error: `No se pudo completar la operación. Quedó registrado para revisarlo (ref ${ref}).` },
      { status: 500 },
    );
  }
}

/**
 * ¿El fallo es que el token todavía no "existe" o ya venció?
 *
 * Postgres rechaza un token cuyo `iat` está por delante de SU reloj —"JWT
 * issued at future"—, y entre el servidor que lo firma y el que lo valida
 * puede haber un segundo de diferencia. Es transitorio por definición: el
 * mismo token sirve un momento después.
 */
function esDesfasajeDeReloj(err: unknown): boolean {
  const mensaje = err instanceof Error ? err.message : String(err);
  return /JWT/i.test(mensaje) && /(issued at future|expired)/i.test(mensaje);
}
