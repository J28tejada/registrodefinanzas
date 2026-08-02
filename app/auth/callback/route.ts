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
  if (error) return alLogin(traducirCanje(error.message, req.nextUrl.origin));

  return NextResponse.redirect(`${base}${next.startsWith('/') ? next : '/'}`);
}

/**
 * El error de PKCE es críptico y casi siempre significa lo mismo: el flujo
 * arrancó en un dominio y volvió a otro, así que la cookie con el verificador
 * no viajó. Pasa cuando Supabase ignora el redirectTo (porque no está en su
 * lista de Redirect URLs) y cae en el Site URL, que apunta a otro lado.
 */
function traducirCanje(mensaje: string, origenActual: string): string {
  if (/code verifier|pkce/i.test(mensaje)) {
    return `La vuelta del login aterrizó en ${origenActual}, un dominio distinto del que inició sesión, `
      + 'así que se perdió la cookie de verificación. En Supabase → Authentication → URL Configuration, '
      + 'agregá este dominio a Redirect URLs y revisá que el Site URL sea el mismo.';
  }
  return mensaje;
}
