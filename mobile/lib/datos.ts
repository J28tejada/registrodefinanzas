import type { Db } from '@compartido/db';
import { supabase } from './supabase';

/**
 * El contexto de datos que piden todas las funciones de `lib/db.ts`.
 *
 * Es literalmente la misma forma que arma `conSesion` en la web: un cliente y el
 * dueño de los datos. Por eso las 2100 líneas de la capa de datos se usan sin
 * cambiar nada — `getCardsWithUsage(db, ...)` no sabe ni le importa si el
 * cliente salió de una cookie o del Keychain.
 *
 * Lo que sí cambia es quién valida: en la web las rutas de API validan antes de
 * llamar a db.ts. Acá no hay ruta en el medio, así que lo único que separa los
 * datos de una persona de los de otra es RLS. Está activo en todas las tablas y
 * db.ts filtra por `user_id` igual, por las dudas.
 */
export function db(userId: string): Db {
  return { supabase, userId };
}
