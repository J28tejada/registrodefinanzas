import { PASILLOS } from './types';

/**
 * Agrupa por pasillo, en el orden en que se camina el supermercado.
 *
 * Los pasillos que no están en la lista sugerida —los que el usuario escribió a
 * mano— van al final, alfabéticos.
 */
export function agruparPorPasillo<T extends { category: string }>(articulos: T[]): [string, T[]][] {
  const grupos = new Map<string, T[]>();
  for (const a of articulos) grupos.set(a.category, [...(grupos.get(a.category) ?? []), a]);

  return [...grupos.entries()].sort(([a], [b]) => {
    const ia = PASILLOS.indexOf(a);
    const ib = PASILLOS.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, 'es');
  });
}

/** Lo mínimo para sumar: lo que trae cada artículo de una compra. */
interface ArticuloSumable {
  quantity: number;
  unit_price: number;
  checked: boolean;
  planned_quantity: number | null;
  planned_unit_price: number | null;
}

/**
 * Los totales de una compra, calculados en el cliente.
 *
 * Son los mismos que devuelve `shopping_trip_totals`, replicados acá para que
 * tildar no necesite volver al servidor. Con refetch, dos toques seguidos
 * lanzan dos GET solapados y el que vuelve tarde pisa al otro: el segundo
 * artículo se destilda solo en pantalla. Justo lo que la actualización
 * optimista venía a evitar.
 *
 * Si esto y la función SQL se separan, la pantalla miente. Están probados
 * contra los mismos datos.
 */
export function totalesDeCompra(articulos: ArticuloSumable[]) {
  const monto = (a: ArticuloSumable) => a.quantity * a.unit_price;
  // Lo no planeado aporta cero al plan: si aportara su precio, cada antojo
  // inflaría el plan en su propio monto y el desvío no se movería.
  const planeado = (a: ArticuloSumable) =>
    (a.planned_quantity ?? 0) * (a.planned_unit_price ?? 0);
  const sinPlanear = (a: ArticuloSumable) => a.checked && a.planned_quantity === null;

  return {
    total: articulos.reduce((s, a) => s + monto(a), 0),
    checkedTotal: articulos.filter(a => a.checked).reduce((s, a) => s + monto(a), 0),
    plannedTotal: articulos.reduce((s, a) => s + planeado(a), 0),
    unplannedTotal: articulos.filter(sinPlanear).reduce((s, a) => s + monto(a), 0),
    items: articulos.length,
    checkedItems: articulos.filter(a => a.checked).length,
    unplannedItems: articulos.filter(sinPlanear).length,
  };
}
