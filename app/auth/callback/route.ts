import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Vuelta de los dos flujos que terminan en sesión: el enlace de confirmación
 * por correo y el "Continuar con Google". Ambos llegan con un `code` que se
 * canjea igual.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Detrás de Vercel el origin puede ser una URL interna, y el usuario
  // terminaría en un dominio que no es el suyo.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  const alLogin = (motivo: string) =>
    NextResponse.redirect(`${base}/login?error=${encodeURIComponent(motivo)}`);

  // Si cancelás la pantalla de Google, vuelve con el motivo y sin código.
  const errorOauth = searchParams.get('error_description') ?? searchParams.get('error');
  if (errorOauth) return alLogin(errorOauth);

  if (!code) return alLogin('El enlace no traía código de confirmación.');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return alLogin(error.message);

  return NextResponse.redirect(`${base}${next.startsWith('/') ? next : '/'}`);
}
