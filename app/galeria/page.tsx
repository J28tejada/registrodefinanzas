'use client';

import MonthSummary from '@/components/MonthSummary';
import BudgetBar from '@/components/BudgetBar';
import CategoryIcon from '@/components/CategoryIcon';
import TransactionList from '@/components/TransactionList';
import CardStatement from '@/components/CardStatement';
import {
  ESTADOS_DE_CUENTA, ICONOS, MOVIMIENTOS, MOVIMIENTOS_ANCHO, PIEZAS, PRESUPUESTOS,
  RESUMENES,
} from '@/lib/galeria';

/**
 * El catálogo de componentes de la web, para compararlo con el del teléfono.
 *
 * No es una pantalla de la app: no lee datos del usuario ni llama a ninguna API.
 * Dibuja los componentes REALES con los especímenes de `lib/galeria.ts`, que son
 * los mismos que usa la galería de Expo. `scripts/comparar-galeria.mjs`
 * fotografía las dos y las resta.
 *
 * Que dibuje los componentes de verdad y no una copia es todo el punto: una
 * galería con su propio JSX comprobaría que la galería se ve igual, no la app.
 */
export default function GaleriaPage() {
  return (
    <div className="min-h-screen bg-fondo p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-semibold text-tinta">Galería · web</h1>
          <p className="text-tinta-2 text-sm">{PIEZAS.length} piezas para comparar con el teléfono</p>
        </div>

        {RESUMENES.map(p => (
          <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
            <MonthSummary income={p.income} expenses={p.expenses} balance={p.balance} />
          </Pieza>
        ))}

        {PRESUPUESTOS.map(p => (
          <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
            <BudgetBar budget={p.budget} />
          </Pieza>
        ))}

        {[...MOVIMIENTOS, ...MOVIMIENTOS_ANCHO].map(p => (
          <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
            <TransactionList transactions={p.transactions} onEdit={() => {}} onDelete={() => {}} />
          </Pieza>
        ))}

        {ESTADOS_DE_CUENTA.map(p => (
          <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
            <CardStatement
              card={p.card} balance={p.balance} payments={p.payments}
              mediosDePago={p.mediosDePago} onCambio={() => {}}
            />
          </Pieza>
        ))}

        {ICONOS.map(p => (
          <Pieza key={p.id} id={p.id} titulo={p.titulo} ancho={p.ancho}>
            <CategoryIcon icon={p.icon} color={p.color} type={p.type} size={p.size} />
          </Pieza>
        ))}
      </div>
    </div>
  );
}

/**
 * El envoltorio de cada pieza.
 *
 * El ancho va fijo y en píxeles: si un lado midiera 320 y el otro 318, todas las
 * piezas darían distinto y el diff no serviría para nada. El `data-pieza` es lo
 * que el comparador busca para recortar.
 */
function Pieza({ id, titulo, ancho, children }: {
  id: string; titulo: string; ancho: number; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-tinta-2 mb-2">{titulo}</p>
      <div data-pieza={id} style={{ width: ancho }}>{children}</div>
    </div>
  );
}
