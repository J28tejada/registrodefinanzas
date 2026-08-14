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
