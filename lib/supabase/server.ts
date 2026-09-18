import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

/**
 * El token de la cabecera `Authorization`, si la petición trae uno.
 *
 * La app de Expo no tiene cookies: guarda su sesión en el llavero del teléfono
 * y manda el token a mano, que es como se autentica cualquier app nativa. Es el
 * MISMO token que el navegador lleva en la cookie y lo valida el mismo
 * Supabase; lo único que cambia es en qué parte de la petición viaja.
 *
 * Solo hace falta para lo que el teléfono no puede resolver contra la base:
 * hoy, el asistente, porque la clave del modelo es un secreto del servidor.
 */
export async function tokenDeCabecera(): Promise<string | null> {
  try {
    const cabecera = (await headers()).get('authorization') ?? '';
    const [esquema, token] = cabecera.split(' ');
    return esquema?.toLowerCase() === 'bearer' && token ? token : null;
  } catch {
    // Fuera de una petición no hay cabeceras que leer.
    return null;
  }
}

/** Cliente atado a la sesión del usuario: todas sus consultas pasan por RLS. */
export async function createClient() {
  const token = await tokenDeCabecera();
  if (token) {
    // Sin cookies: el token va en cada consulta, así que RLS ve al mismo
    // usuario que vería por cookie. No hay `setAll` porque no hay nada que
    // refrescar — de eso se ocupa el teléfono con su propia sesión.
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll: () => [], setAll: () => {} },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
  }

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
