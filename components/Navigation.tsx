'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Receipt, Bot, Wallet, ChevronDown, LayoutGrid, Plus, Mail, MessageCircle, Send, Target, Settings, HandCoins, CreditCard, ShoppingCart, Menu, X, LogOut, PieChart } from 'lucide-react';
import { useLedger } from './LedgerContext';
import LedgerSelector from './LedgerSelector';
import { createClient } from '@/lib/supabase/browser';
import { LEDGER_COLOR_MAP } from '@/lib/types';

/** Las mismas pantallas en los dos lados: el menú de móvil no es un resumen. */
const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/transactions', icon: Receipt, label: 'Transacciones' },
  { href: '/stats', icon: PieChart, label: 'Estadísticas' },
  { href: '/shopping', icon: ShoppingCart, label: 'Supermercado' },
  { href: '/budgets', icon: Target, label: 'Presupuestos' },
  { href: '/debts', icon: HandCoins, label: 'Deudas' },
  { href: '/cards', icon: CreditCard, label: 'Medios de pago' },
  { href: '/chat', icon: Bot, label: 'Chat IA' },
  { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/telegram', icon: Send, label: 'Telegram' },
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

  const ledgerColor = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;

  return (
    <>
      <LedgerSelector />

      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-60 bg-slate-900 border-r border-slate-800 flex-col z-20">
        <div className="p-5 border-b border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm text-white">Jobidai Wallet</p>
              <p className="text-xs text-slate-400">Control financiero</p>
            </div>
          </div>

          {/* Ledger switcher */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSelectorOpen(true)}
              className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-left"
            >
              {ledgerColor ? (
                <div
                  className="w-4 h-4 rounded-sm flex-shrink-0"
                  style={{ background: `linear-gradient(to right, ${ledgerColor.dark} 35%, ${ledgerColor.main} 35%)` }}
                />
              ) : (
                <LayoutGrid className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <span className="text-sm text-slate-200 flex-1 truncate">
                {currentLedger?.name ?? 'Todas las cuentas'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
            </button>
            <button
              onClick={() => setSelectorOpen(true)}
              title="Gestionar cuentas"
              className="p-2 bg-slate-800 hover:bg-emerald-600 rounded-lg transition-colors text-slate-400 hover:text-white flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = esActiva(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <p className="text-xs text-slate-500 text-center">Jobidai Wallet</p>
        </div>
      </aside>

      {/* Mobile: top bar with ledger switcher */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-slate-900 border-b border-slate-800 z-20 px-4 py-3 flex items-center gap-2">
        <button
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir el menú"
          className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0 active:bg-emerald-600 transition-colors"
        >
          <Menu className="w-4 h-4 text-white" />
        </button>
        <button
          onClick={() => setSelectorOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          {ledgerColor ? (
            <div
              className="w-3.5 h-3.5 rounded-sm flex-shrink-0"
              style={{ background: `linear-gradient(to right, ${ledgerColor.dark} 35%, ${ledgerColor.main} 35%)` }}
            />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          )}
          <span className="text-sm text-slate-200 flex-1 text-left truncate">
            {currentLedger?.name ?? 'Todas las cuentas'}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
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
        className={`md:hidden fixed top-0 left-0 bottom-0 z-40 w-[min(17rem,82vw)] bg-slate-900 border-r border-slate-800 flex flex-col transition-[transform,visibility] duration-200 ${
          menuAbierto ? 'translate-x-0 visible' : '-translate-x-full invisible'
        }`}
      >
        <div className="bg-emerald-500 px-5 pt-safe">
          <div className="flex items-center gap-2 py-5">
            <Wallet className="w-5 h-5 text-white flex-shrink-0" />
            <p className="text-lg text-white flex-1">
              <span className="font-bold">Jobidai</span> Wallet
            </p>
            <button
              onClick={() => setMenuAbierto(false)}
              aria-label="Cerrar el menú"
              className="p-1 -mr-1 text-white/80 active:text-white flex-shrink-0"
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
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-slate-300 active:bg-slate-800'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 pb-safe border-t border-slate-800 space-y-2">
          <button
            onClick={salir}
            className="w-full py-3 bg-emerald-500 active:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
          {email && <p className="text-xs text-slate-500 text-center truncate">{email}</p>}
        </div>
      </aside>

      {/* Mobile bottom nav — 5 slots with center FAB */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-20 flex items-end pb-safe">
        {/* Dashboard */}
        <Link
          href="/"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs transition-colors ${pathname === '/' ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-5 h-5" />
          Dashboard
        </Link>

        {/* Transacciones */}
        <Link
          href="/transactions"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs transition-colors ${pathname === '/transactions' ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          <Receipt className="w-5 h-5" />
          Transacciones
        </Link>

        {/* Center FAB — add transaction */}
        <div className="flex-1 flex flex-col items-center justify-end pb-2">
          <button
            onClick={() => setGlobalAddOpen(true)}
            className="w-14 h-14 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 -mt-7 transition-colors"
            aria-label="Registrar transacción"
          >
            <Plus className="w-7 h-7 text-white" />
          </button>
        </div>

        {/* Chat IA — star feature */}
        <Link
          href="/chat"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs transition-colors ${pathname === '/chat' ? 'text-emerald-400' : 'text-emerald-300/70 hover:text-emerald-300'}`}
        >
          <div className={`relative ${pathname !== '/chat' ? 'animate-pulse' : ''}`}>
            <Bot className="w-5 h-5" />
          </div>
          Chat IA
        </Link>

        {/* Presupuestos */}
        <Link
          href="/budgets"
          className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 text-xs transition-colors ${pathname === '/budgets' ? 'text-emerald-400' : 'text-slate-400'}`}
        >
          <Target className="w-5 h-5" />
          Presupuesto
        </Link>
      </nav>
    </>
  );
}
