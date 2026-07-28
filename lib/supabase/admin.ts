import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Cliente con la service role: salta RLS.
 *
 * Solo para caminos donde no hay sesión y el usuario se resuelve de otra forma:
 * el webhook de WhatsApp (por el teléfono vinculado) y el cron. Nunca lo
 * importes desde código que corra en el navegador.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const faltan = [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY']
      .filter(Boolean).join(', ');
    throw new Error(`Supabase no está configurado. Faltan variables: ${faltan}`);
  }
  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
