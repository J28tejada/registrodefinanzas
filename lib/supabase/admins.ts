import { createClient } from './server';

/**
 * La instancia de Evolution es una sola y compartida: quien puede crearla o
 * cerrarle la sesión se la corta a todos. `ADMIN_EMAILS` dice quién puede.
 *
 * Sin la variable queda abierto a cualquier usuario autenticado, que es lo
 * correcto mientras seas el único; en cuanto haya una segunda cuenta hay que
 * definirla, o alguien más puede desconectarte el WhatsApp.
 */
export function adminsConfigurados(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function esAdmin(): Promise<{ ok: boolean; motivo?: string }> {
  const admins = adminsConfigurados();
  if (admins.length === 0) return { ok: true };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email) return { ok: false, motivo: 'No hay sesión.' };
  if (!admins.includes(email)) {
    return {
      ok: false,
      motivo: 'Solo un administrador puede tocar la conexión de WhatsApp, porque la instancia es compartida.',
    };
  }
  return { ok: true };
}
