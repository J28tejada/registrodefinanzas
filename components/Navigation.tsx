'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Receipt, Bot, Wallet, ChevronDown, LayoutGrid, Plus, Mail, Target, Settings, HandCoins, WalletCards, ShoppingCart, Menu, X, LogOut, PieChart } from 'lucide-react';
import { useLedger } from './LedgerContext';
import LedgerSelector from './LedgerSelector';
import { createClient } from '@/lib/supabase/browser';
import { LEDGER_COLOR_MAP } from '@/lib/types';

/** Las mismas pantallas en los dos lados: el menú de móvil no es un resumen. */
const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/transactions', icon: Receipt, label: 'Movimientos' },
  { href: '/stats', icon: PieChart, label: 'Estadísticas' },
  { href: '/shopping', icon: ShoppingCart, label: 'Supermercado' },
  { href: '/budgets', icon: Target, label: 'Presupuestos' },
  { href: '/debts', icon: HandCoins, label: 'Deudas' },
  // `WalletCards` y no `Wallet`: ese ya es el ícono de la marca en la
  // cabecera, y repetirlo hace que el menú parezca apuntar a la app.
  { href: '/cards', icon: WalletCards, label: 'Billetera' },
  // Uno solo y no tres: el asistente es el mismo, y tenerlo tres veces en el
  // menú hacía pensar que había uno por canal. Adentro se elige por dónde
  // hablarle.
  { href: '/chat', icon: Bot, label: 'Asistente' },
  { href: '/email', icon: Mail, label: 'Correo' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
];

/**
 * El dashboard va exacto y el resto por prefijo: estando en el detalle de una
 * tarjeta (`/cards/<id>`), su sección tiene que seguir marcada en el menú.
 */
function esActiva(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentLedger, setSelectorOpen, setGlobalAddOpen } = useLedger();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [email, setEmail] = useState('');

  // Al navegar el menú tiene que irse solo: si no, tapa la pantalla recién
  // abierta y hay que cerrarlo a mano.
  useEffect(() => { setMenuAbierto(false); }, [pathname]);

  // El correo solo se muestra en el panel, así que se pide una vez y no
  // vuelve a pedirse al abrirlo.
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  // Con el panel abierto el fondo no se scrollea: si no, se mueve lo de atrás
  // mientras arrastrás el menú.
  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [menuAbierto]);

  const salir = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const enElAsistente = pathname.startsWith('/chat');

  const ledgerColor = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;

  return (
    <>
      <LedgerSelector />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 bg-hundido border-r border-linea flex-col z-20">
        <div className="p-3 pt-4 space-y-2">
          <div className="flex items-center gap-2 px-2">
            <div className="w-6 h-6 bg-primario rounded-md flex items-center justify-center">
              <Wallet className="w-3.5 h-3.5 text-sobre-primario" />
            </div>
            <p className="font-semibold text-sm text-tinta">Jobidai Wallet</p>
          </div>

          {/* Ledger switcher */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectorOpen(true)}
              className="flex-1 flex items-center gap-2 px-2 py-1.5 hover:bg-presionado rounded-lg transition-colors text-left"
            >
              {ledgerColor ? (
                <div className="w-3 h-3 rounded flex-shrink-0" style={{ background: ledgerColor.main }} />
              ) : (
                <LayoutGrid className="w-4 h-4 text-tinta-2 flex-shrink-0" />
              )}
              <span className="text-sm text-tinta flex-1 truncate">
                {currentLedger?.name ?? 'Todas las cuentas'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-tinta-2 flex-shrink-0" />
            </button>
            <button
              onClick={() => setSelectorOpen(true)}
              title="Gestionar cuentas"
              className="p-2 hover:bg-presionado rounded-lg transition-colors text-tinta-2 hover:text-tinta flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 pb-3 space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = esActiva(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-presionado text-tinta font-medium'
                    : 'text-tinta-2 hover:bg-presionado hover:text-tinta'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile: top bar with ledger switcher */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-fondo border-b border-linea z-20 px-3 py-2.5 flex items-center gap-1">
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir el menú"
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-tinta active:bg-hundido transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        {/* Se lee como el título de la pantalla y se toca para cambiar de
            cuenta: sin caja alrededor, que la hacía parecer un campo de texto. */}
        <button
          onClick={() => setSelectorOpen(true)}
          className="min-w-0 flex items-center gap-2 active:bg-hundido rounded-lg px-2 py-1.5 transition-colors"
        >
          {ledgerColor ? (
            <div className="w-3 h-3 rounded flex-shrink-0" style={{ background: ledgerColor.main }} />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5 text-tinta-2 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-tinta text-left truncate">
            {currentLedger?.name ?? 'Todas las cuentas'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-tinta-2 flex-shrink-0" />
        </button>
      </header>

      {/* Panel lateral de móvil */}
      <div
        className={`md:hidden fixed inset-0 z-30 bg-black/60 transition-opacity ${
          menuAbierto ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuAbierto(false)}
        aria-hidden
      />
      {/* `invisible` y no solo el desplazamiento: corrido fuera de pantalla el
          panel sigue existiendo, y sus enlaces se pueden tabular a ciegas.
          La transición lo incluye para que al cerrar termine de salir antes de
          desaparecer, en vez de cortarse de golpe. */}
      <aside
        className={`md:hidden fixed top-0 left-0 bottom-0 z-40 w-[min(17rem,82vw)] bg-panel border-r border-linea flex flex-col transition-[transform,visibility] duration-200 ${
          menuAbierto ? 'translate-x-0 visible' : '-translate-x-full invisible'
        }`}
      >
        <div className="px-5 pt-safe border-b border-linea">
          <div className="flex items-center gap-2 py-4">
            <div className="w-6 h-6 bg-primario rounded-md flex items-center justify-center flex-shrink-0">
              <Wallet className="w-3.5 h-3.5 text-sobre-primario" />
            </div>
            <p className="text-base font-semibold text-tinta flex-1">Jobidai Wallet</p>
            <button
              onClick={() => setMenuAbierto(false)}
              aria-label="Cerrar el menú"
              className="p-1 -mr-1 text-tinta-2 active:text-tinta flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Con tantas pantallas ya no entran todas en un teléfono chico */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              // El efecto sobre `pathname` no alcanza: tocar la pantalla en la
              // que ya estás no navega, y el panel se quedaría abierto.
              onClick={() => setMenuAbierto(false)}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-colors ${
                esActiva(pathname, href)
                  ? 'bg-hundido text-tinta font-medium'
                  : 'text-tinta-2 active:bg-hundido'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 pb-safe border-t border-linea space-y-2">
          <button
            onClick={salir}
            className="w-full py-3 active:bg-hundido text-tinta-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
          {email && <p className="text-xs text-tinta-2 text-center truncate">{email}</p>}
        </div>
      </aside>

      {/* Barra de abajo del teléfono: cuatro lugares y el botón de registrar al
          medio. Presupuestos sigue en el menú lateral: estos cuatro son para lo
          que se abre a diario, y un tope se configura una vez y después se mira
          de paso en el tablero. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-fondo border-t border-linea z-20 flex items-center pb-safe">
        <Lugar href="/" icono={LayoutDashboard} texto="Inicio" activa={pathname === '/'} />
        <Lugar href="/transactions" icono={Receipt} texto="Movimientos" activa={pathname === '/transactions'} />

        {/* Alineado con la barra y sin sombra: flotando con un halo parecía de
            otra app. Sigue siendo lo único relleno, así que se encuentra igual. */}
        <div className="flex-1 flex justify-center py-2">
          <button
            onClick={() => setGlobalAddOpen(true)}
            className="w-11 h-11 bg-primario hover:bg-primario/85 active:bg-primario/85 rounded-lg flex items-center justify-center transition-colors"
            aria-label="Registrar movimiento"
          >
            <Plus className="w-6 h-6 text-sobre-primario" />
          </button>
        </div>

        {/* Por prefijo: estando en la pestaña de WhatsApp o de Telegram, la
            sección sigue siendo esta. */}
        <Lugar href="/chat" icono={Bot} texto="Asistente" activa={enElAsistente} />
        <Lugar href="/stats" icono={PieChart} texto="Estadísticas" activa={pathname === '/stats'} />
      </nav>
    </>
  );
}

/** Un lugar de la barra de abajo: activo en tinta, el resto en gris. */
function Lugar({ href, icono: Icono, texto, activa }: {
  href: string; icono: typeof LayoutDashboard; texto: string; activa: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-2xs font-medium transition-colors ${activa ? 'text-tinta' : 'text-tinta-2 hover:text-tinta'}`}
    >
      <Icono className="w-5 h-5" />
      {texto}
    </Link>
  );
}
