'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Receipt, Bot, Wallet, ChevronDown, LayoutGrid, Plus, Mail, MessageCircle, Send, Target, Settings, HandCoins } from 'lucide-react';
import { useLedger } from './LedgerContext';
import LedgerSelector from './LedgerSelector';
import { LEDGER_COLOR_MAP } from '@/lib/types';

const desktopNavItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/transactions', icon: Receipt, label: 'Transacciones' },
  { href: '/budgets', icon: Target, label: 'Presupuestos' },
  { href: '/debts', icon: HandCoins, label: 'Deudas' },
  { href: '/email', icon: Mail, label: 'Correo' },
  { href: '/telegram', icon: Send, label: 'Telegram' },
  { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/chat', icon: Bot, label: 'Chat IA' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
];

/** En móvil no entran todos abajo: estos van como iconos en la barra de arriba. */
const mobileTopItems = [
  { href: '/debts', icon: HandCoins, label: 'Deudas' },
  { href: '/telegram', icon: Send, label: 'Telegram' },
  { href: '/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/email', icon: Mail, label: 'Correo' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
];

export default function Navigation() {
  const pathname = usePathname();
  const { currentLedger, setSelectorOpen, setGlobalAddOpen } = useLedger();

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
          {desktopNavItems.map(({ href, icon: Icon, label }) => {
            const active = pathname === href;
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
        <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4 h-4 text-white" />
        </div>
        <button
          onClick={() => setSelectorOpen(true)}
          className="flex-1 flex items-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-1.5 transition-colors"
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
          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
        </button>
        {/* La barra inferior tiene cinco lugares: el resto vive acá en móvil */}
        {mobileTopItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
              pathname === href
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-slate-800 text-slate-400 hover:bg-emerald-600 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
          </Link>
        ))}
      </header>

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
