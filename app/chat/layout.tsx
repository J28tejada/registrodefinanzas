'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, MessageCircle, Send } from 'lucide-react';

/**
 * Los tres lugares donde vive el mismo asistente.
 *
 * Antes eran tres entradas sueltas en el menú, y eso hacía pensar que había
 * tres asistentes distintos. Es uno solo: el de acá, el de WhatsApp y el de
 * Telegram anotan en las mismas cuentas y contestan lo mismo. Lo único que
 * cambia es por dónde se le habla.
 */
const CANALES = [
  { href: '/chat', icon: Bot, label: 'En la app' },
  { href: '/chat/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/chat/telegram', icon: Send, label: 'Telegram' },
];

export default function AsistenteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enLaConversacion = pathname === '/chat';

  /*
   * Solo la conversación se encierra en un alto fijo, y va con flex en vez de
   * restarle píxeles a mano: el campo de escribir es lo último del panel y
   * tiene que quedar siempre a la vista, pero cuánto mide la barra de pestañas
   * depende de la tipografía, y cuánto mide la barra de abajo depende del área
   * segura del teléfono. Con `flex-1` la conversación se queda con lo que
   * sobre, sin que nadie tenga que adivinar.
   *
   * `dvh` y no `vh`: en el navegador del teléfono `vh` cuenta la barra de
   * direcciones incluso cuando está escondida, y el panel termina más abajo del
   * borde real.
   *
   * Las otras dos pestañas son páginas largas que se leen scrolleando: con el
   * alto fijo quedarían cortadas.
   */
  const encuadre = enLaConversacion
    ? 'flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-3rem)]'
    : '';

  return (
    <div className={`max-w-3xl mx-auto pt-14 md:pt-0 ${encuadre}`}>
      {/* `flex-shrink-0` para que el encuadre de la conversación no aplaste
          esta barra en vez de achicar la conversación. */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-4 flex-shrink-0">
        {CANALES.map(({ href, icon: Icon, label }) => {
          // Exacto y no por prefijo: `/chat` es prefijo de los otros dos, y por
          // prefijo quedarían las tres marcadas a la vez.
          const activo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activo
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {/* El ícono se va en pantalla angosta: en un iPhone SE, con los
                  tres íconos puestos "Telegram" no entra y hay que scrollear la
                  barra para encontrarlo. El nombre solo alcanza. */}
              <Icon className="w-4 h-4 flex-shrink-0 hidden sm:block" />
              {label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
