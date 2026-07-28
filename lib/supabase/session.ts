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

/** Envuelve un handler de ruta traduciendo la falta de sesión a un 401. */
export async function conSesion(
  fn: (db: Db) => Promise<NextResponse>,
): Promise<NextResponse> {
  let db: Db;
  try {
    db = await requireDb();
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }
  return fn(db);
}
