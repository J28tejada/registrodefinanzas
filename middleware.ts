import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/** Rutas que se pueden ver sin sesión. */
// `/galeria` es el catálogo de componentes que se compara contra el de Expo:
// dibuja piezas fijas, no lee un solo dato del usuario.
const PUBLICAS = ['/login', '/auth/callback', '/auth/error', '/galeria'];
/**
 * Rutas donde el middleware no toca nada.
 *
 * Los webhooks y el cron no traen sesión de navegador: se autentican con su
 * propio token y resuelven al usuario por su cuenta.
 *
 * /auth/callback va acá por otro motivo: es el canje del código por sesión y
 * todavía no hay sesión que refrescar. Correr getUser() ahí es al pepe, y como
 * de paso reescribe las cookies de la respuesta, puede pisar el code verifier
 * de PKCE que el navegador guardó al arrancar el flujo. Sin esa cookie el
 * canje falla con "PKCE code verifier not found in storage".
 */
const SIN_SESION = [
  '/api/whatsapp/webhook',
  '/api/telegram/webhook',
  '/api/chats/cron',
  '/api/cards/cron',
  '/auth/callback',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (SIN_SESION.some(p => pathname.startsWith(p))) return NextResponse.next();

  /*
   * Una petición de la app del teléfono trae su token en `Authorization` y no
   * en una cookie, así que acá no hay sesión que encontrar y la respuesta sería
   * un 401 antes de llegar a la ruta.
   *
   * Pasa de largo y la ruta decide: `requireDb` valida ese mismo token contra
   * Supabase, y si no sirve devuelve el mismo 401. Lo que NO se hace es
   * comprobarlo dos veces en dos lugares distintos — ahí es donde uno se
   * queda viejo y deja pasar lo que el otro rechaza.
   */
  if (pathname.startsWith('/api/') && /^bearer /i.test(request.headers.get('authorization') ?? '')) {
    return NextResponse.next();
  }

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
    // Con la query, no solo el path: quien abre una invitación
    // (/unirse?codigo=ABC123) sin sesión volvía a /unirse sin el código y tenía
    // que tipearlo a mano.
    login.searchParams.set('next', pathname + request.nextUrl.search);
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
  // `apple-icon` y `manifest.webmanifest` van excluidos igual que `icon`: los
  // pide el sistema operativo al agregar la app a la pantalla de inicio, sin
  // sesión y sin seguir redirecciones. Si el middleware los manda al login, el
  // teléfono se queda sin ícono y sin nombre, y no da ningún error visible.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|icons|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
