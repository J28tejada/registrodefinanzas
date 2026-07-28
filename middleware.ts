import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/** Rutas que se pueden ver sin sesión. */
const PUBLICAS = ['/login', '/auth/callback', '/auth/error'];
/**
 * El webhook y el cron no traen sesión de navegador: se autentican con su
 * propio token y resuelven al usuario por su cuenta.
 */
const SIN_SESION = ['/api/whatsapp/webhook', '/api/whatsapp/cron'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SIN_SESION.some(p => pathname.startsWith(p))) return NextResponse.next();

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sin Supabase configurado no hay sesión posible; la pantalla de login lo dice.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() revalida contra Supabase y refresca el token si hace falta.
  const { data: { user } } = await supabase.auth.getUser();

  const esPublica = PUBLICAS.some(p => pathname.startsWith(p));

  if (!user && !esPublica) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (user && pathname === '/login') {
    const inicio = request.nextUrl.clone();
    inicio.pathname = '/';
    inicio.search = '';
    return NextResponse.redirect(inicio);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
