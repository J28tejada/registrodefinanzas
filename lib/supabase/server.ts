import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Cliente atado a la sesión del usuario: todas sus consultas pasan por RLS. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // En Server Components no se pueden escribir cookies; el middleware
            // ya refrescó la sesión, así que se puede ignorar.
          }
        },
      },
    },
  );
}
