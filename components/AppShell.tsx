'use client';

import { usePathname } from 'next/navigation';
import Navigation from './Navigation';

/** El login no lleva navegación: todavía no hay sesión que navegar. */
const SIN_NAVEGACION = ['/login', '/auth'];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const desnudo = SIN_NAVEGACION.some(p => pathname.startsWith(p));

  if (desnudo) {
    return <main className="min-h-screen p-4">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Navigation />
      {/* pb-32 en móvil: la barra inferior mide ~77px y flota sobre el
          contenido, así que sin este espacio la última tarjeta queda debajo.
          Es el alto de la barra más un respiro, no un número al azar. */}
      <main className="flex-1 md:ml-60 p-4 md:p-6 pb-32 md:pb-6">
        {children}
      </main>
    </div>
  );
}
