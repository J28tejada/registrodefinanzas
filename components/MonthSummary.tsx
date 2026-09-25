'use client';

import Link from 'next/link';
import { separarCentavos } from '@/lib/format';
import { useFormatters } from './SettingsContext';

interface MonthSummaryProps {
  income: number;
  expenses: number;
  balance: number;
  /** A dónde lleva tocar cada total: los movimientos del mes, ya filtrados. */
  incomeHref?: string;
  expensesHref?: string;
}

/**
 * Lo que entró, lo que salió y lo que queda en el mes.
 *
 * Eran tres tarjetas del mismo tamaño, cada una con su borde de color y su
 * ícono en una cajita, y ninguna se imponía: el ojo no sabía por dónde empezar.
 * Ahora el balance es el único número grande, porque es la pregunta que uno
 * abre la app para contestar, y los otros dos lo explican en una línea abajo.
 *
 * El verde queda solo para lo que entra. El gasto va en tinta: pintarlo de rojo
 * hacía que un mes normal pareciera una alarma.
 */
export default function MonthSummary({ income, expenses, balance, incomeHref, expensesHref }: MonthSummaryProps) {
  const fmt = useFormatters();
  const negativo = balance < 0;
  const [entero, centavos] = separarCentavos(fmt.money(Math.abs(balance)));

  return (
    <section className="bg-panel border border-t-borde-luz border-linea rounded-2xl overflow-hidden">
      <p className="text-sm text-tinta-2 px-5 pt-4">Balance del mes</p>
      <p className={`text-4xl font-semibold tracking-tight tabular-nums mt-1 px-5 ${negativo ? 'text-peligro' : 'text-tinta'}`}>
        {negativo ? '−' : ''}{entero}<span className={negativo ? 'text-peligro/60' : 'text-tinta-3'}>{centavos}</span>
      </p>
      <div className="flex mt-5 border-t border-linea">
        <Total etiqueta="Ingresos" monto={`+${fmt.money(income)}`} tono="text-acento" href={incomeHref} />
        <div className="w-px bg-linea" />
        <Total etiqueta="Gastos" monto={`−${fmt.money(expenses)}`} tono="text-tinta" href={expensesHref} />
      </div>
    </section>
  );
}

function Total({ etiqueta, monto, tono, href }: {
  etiqueta: string; monto: string; tono: string; href?: string;
}) {
  const clase = 'flex-1 px-5 py-3';
  const contenido = (
    <>
      <p className="text-xs text-tinta-2">{etiqueta}</p>
      <p className={`text-base font-medium tabular-nums mt-0.5 ${tono}`}>{monto}</p>
    </>
  );
  return href
    ? <Link href={href} className={`${clase} hover:bg-hundido transition-colors`}>{contenido}</Link>
    : <div className={clase}>{contenido}</div>;
}
