'use client';

import { useState, useEffect } from 'react';
import { MoreHorizontal, X, Wallet, CalendarDays, CreditCard, Mail } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const extraNav = [
  { href: '/calendar', icon: CalendarDays, label: 'Calendario' },
  { href: '/cards', icon: CreditCard, label: 'Tarjetas' },
  { href: '/email-transactions', icon: Mail, label: 'Correos' },
];

export default function MobileHeader() {
  const [open, setOpen] = useState(false);
  const [pendingEmails, setPendingEmails] = useState(0);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/email-transactions');
        if (res.ok) {
          const data = await res.json();
          setPendingEmails(Array.isArray(data) ? data.length : 0);
        }
      } catch { /* silent */ }
    };
    load();
    window.addEventListener('finanzas:refresh', load);
    return () => window.removeEventListener('finanzas:refresh', load);
  }, []);

  return (
    <div className="md:hidden sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm text-white">FinanzasIA</span>
        </div>

        <div className="flex items-center gap-2">
          {pendingEmails > 0 && !open && (
            <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingEmails}
            </span>
          )}
          <UserButton appearance={{ elements: { avatarBox: 'w-7 h-7' } }} />
          <button
            onClick={() => setOpen(v => !v)}
            className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            {open ? <X className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-1.5 border-t border-slate-800/60 pt-3">
          {extraNav.map(({ href, icon: Icon, label }) => {
            const isEmails = href === '/email-transactions';
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 transition-colors"
              >
                <div className="relative">
                  <Icon className="w-5 h-5 text-slate-300" />
                  {isEmails && pendingEmails > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {pendingEmails}
                    </span>
                  )}
                </div>
                <span className="text-sm text-slate-200">{label}</span>
                {isEmails && pendingEmails > 0 && (
                  <span className="ml-auto text-xs text-blue-400">{pendingEmails} pendiente{pendingEmails > 1 ? 's' : ''}</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
