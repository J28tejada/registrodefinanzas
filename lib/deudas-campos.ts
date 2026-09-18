import { Debt } from './types';

/**
 * Valida el alta de una deuda.
 *
 * Vive en `lib/` por lo mismo que `tarjetas-campos.ts`: la web la manda por
 * `POST /api/debts` y el teléfono escribe contra la base sin ruta en el medio.
 * Escrita dos veces, tarde o temprano una se corrige y la otra no — y del lado
 * que quede viejo entrarían deudas con cero cuotas, que hacen que el avance del
 * mes se calcule dividiendo por cero.
 */
export type DeudaNueva = Omit<Debt, 'id' | 'created_at' | 'archived'>;

export function leerDeudaNueva(
  b: Record<string, unknown>,
): { ok: true; datos: DeudaNueva } | { ok: false; error: string } {
  const total = Number(b.total_amount);
  const cuota = Number(b.installment_amount);
  const cuotas = Number(b.installments);

  if (typeof b.name !== 'string' || !b.name.trim()) {
    return { ok: false, error: 'Ponele un nombre a la deuda' };
  }
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: 'El total tiene que ser mayor que cero' };
  }
  if (!Number.isFinite(cuota) || cuota <= 0) {
    return { ok: false, error: 'La cuota tiene que ser mayor que cero' };
  }
  if (!Number.isInteger(cuotas) || cuotas <= 0) {
    return { ok: false, error: 'La cantidad de cuotas tiene que ser un número entero' };
  }
  if (typeof b.category !== 'string' || !b.category.trim()) {
    return { ok: false, error: 'Elegí una categoría para los pagos' };
  }
  if (typeof b.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) {
    return { ok: false, error: 'Fecha de la primera cuota inválida' };
  }

  return {
    ok: true,
    datos: {
      ledger_id: typeof b.ledger_id === 'string' && b.ledger_id ? b.ledger_id : null,
      name: b.name.trim(),
      creditor: typeof b.creditor === 'string' ? b.creditor.trim() : '',
      total_amount: total,
      installment_amount: cuota,
      installments: cuotas,
      start_date: b.start_date,
      category: b.category.trim(),
      notes: typeof b.notes === 'string' ? b.notes.trim() : '',
    },
  };
}
