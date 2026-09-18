import { Ledger, LedgerColor, LEDGER_COLOR_MAP, TransactionScope } from './types';

/**
 * Las reglas de una cuenta: nombre, color y tipo.
 *
 * La quinta validación que se muda a `lib/` por el mismo motivo que las otras
 * cuatro: la web las corre en `app/api/ledgers`, y el teléfono escribe contra la
 * base sin pasar por ahí. Escritas dos veces, una se corrige y la otra no.
 *
 * Los colores salen de `LEDGER_COLOR_MAP` y no de una lista aparte: la lista
 * estaba copiada en las dos rutas, y un color agregado al mapa sin agregarlo a
 * las listas se habría rechazado con "Color inválido" sin que se entienda por
 * qué.
 */
export const COLORES_DE_CUENTA = Object.keys(LEDGER_COLOR_MAP) as LedgerColor[];

const TIPOS: TransactionScope[] = ['personal', 'business'];

/** Lo que hace falta para crear una cuenta: es lo que pide `createLedger`. */
export type CuentaNueva = Omit<Ledger, 'id' | 'created_at'>;

export type CamposDeCuenta = Partial<CuentaNueva>;

type Resultado<T> = { ok: true; campos: T } | { ok: false; error: string };

/** El alta: los tres campos son obligatorios. */
export function leerCuentaNueva(b: Record<string, unknown>): Resultado<CuentaNueva> {
  if (typeof b.name !== 'string' || !b.name.trim()) {
    return { ok: false, error: 'El nombre es requerido' };
  }
  if (!COLORES_DE_CUENTA.includes(b.color as LedgerColor)) {
    return { ok: false, error: 'Color inválido' };
  }
  if (!TIPOS.includes(b.type as TransactionScope)) {
    return { ok: false, error: 'Tipo inválido' };
  }
  return {
    ok: true,
    campos: {
      name: b.name.trim(),
      color: b.color as LedgerColor,
      type: b.type as TransactionScope,
      description: typeof b.description === 'string' ? b.description : '',
    },
  };
}

/** La edición: solo entra lo que viene. No mandar una clave es "no la toques". */
export function leerCambiosDeCuenta(b: Record<string, unknown>): Resultado<CamposDeCuenta> {
  const campos: CamposDeCuenta = {};

  if (b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim()) {
      return { ok: false, error: 'Nombre inválido' };
    }
    campos.name = b.name.trim();
  }
  if (b.color !== undefined) {
    if (!COLORES_DE_CUENTA.includes(b.color as LedgerColor)) {
      return { ok: false, error: 'Color inválido' };
    }
    campos.color = b.color as LedgerColor;
  }
  if (b.type !== undefined) {
    if (!TIPOS.includes(b.type as TransactionScope)) {
      return { ok: false, error: 'Tipo inválido' };
    }
    campos.type = b.type as TransactionScope;
  }
  if (b.description !== undefined) campos.description = String(b.description);

  return { ok: true, campos };
}
