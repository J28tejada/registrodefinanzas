'use client';

import Link from 'next/link';
import { CalendarClock, Scissors } from 'lucide-react';
import { useFormatters } from './SettingsContext';
import { AvisoDeTarjeta, cuandoVence } from '@/lib/tarjetas';

/**
 * El cartel de "se te viene el corte" o "se te viene el pago".
 *
 * Existe además del aviso por WhatsApp porque el aviso puede no llegar: hay que
 * tener el chat vinculado, y no todos lo tienen. Acá se ve igual al abrir la
 * app, que es el respaldo.
 */
export default function CardAlerts({ avisos }: { avisos: AvisoDeTarjeta[] }) {
  const fmt = useFormatters();
  if (avisos.length === 0) return null;

  return (
    <div className="space-y-2">
      {avisos.map(aviso => {
        const esPago = aviso.kind === 'due';
        // El pago urge y el corte solo informa: dejar pasar una fecha de pago
        // cuesta plata, un corte no.
        const tono = esPago
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
          : 'bg-slate-800/60 border-slate-700 text-slate-300';

        return (
          <Link
            key={`${aviso.card.id}-${aviso.kind}`}
            href={`/cards/${aviso.card.id}`}
            className={`flex items-start gap-2.5 border rounded-xl px-4 py-3 text-sm transition-colors hover:brightness-110 ${tono}`}
          >
            {esPago
              ? <CalendarClock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              : <Scissors className="w-4 h-4 mt-0.5 flex-shrink-0" />}
            <span className="min-w-0">
              {esPago ? (
                <>
                  <span className="font-medium">{aviso.card.name}</span> vence el{' '}
                  {fmt.date(aviso.date)} — {cuandoVence(aviso.daysBefore)}.
                  {aviso.balance.aPagar > 0 && (
                    <> Hay {fmt.money(aviso.balance.aPagar)} por pagar.</>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium">{aviso.card.name}</span> corta el{' '}
                  {fmt.date(aviso.date)} — {cuandoVence(aviso.daysBefore)}. Lo que
                  compres después entra en el estado de cuenta siguiente.
                </>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
