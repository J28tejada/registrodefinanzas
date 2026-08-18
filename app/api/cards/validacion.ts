import { NuevaCard } from '@/lib/types';

/**
 * Valida los campos del ciclo y del cupo, compartidos por el alta y la edición.
 *
 * Vive acá y no adentro de cada ruta porque son las mismas seis reglas en los
 * dos lados: duplicadas, tarde o temprano una se corrige y la otra no.
 */
export type CamposDeCiclo = Partial<Pick<NuevaCard,
  'credit_limit' | 'statement_day' | 'due_day' | 'opening_balance' | 'opening_date' | 'alerts'>>;

export function leerCamposDeCiclo(
  b: Record<string, unknown>,
): { ok: true; campos: CamposDeCiclo } | { ok: false; error: string } {
  const campos: CamposDeCiclo = {};

  // Vaciar el campo tiene que poder deshacerse: null es "sin configurar", y no
  // lo mismo que no mandar la clave, que es "no lo toques".
  if (b.credit_limit !== undefined) {
    if (b.credit_limit === null || b.credit_limit === '') {
      campos.credit_limit = null;
    } else {
      const n = Number(b.credit_limit);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false, error: 'El límite tiene que ser mayor que cero.' };
      }
      campos.credit_limit = n;
    }
  }

  for (const clave of ['statement_day', 'due_day'] as const) {
    if (b[clave] === undefined) continue;
    if (b[clave] === null || b[clave] === '') { campos[clave] = null; continue; }
    const n = Number(b[clave]);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return {
        ok: false,
        error: clave === 'statement_day'
          ? 'El día de corte tiene que estar entre 1 y 31.'
          : 'El día de pago tiene que estar entre 1 y 31.',
      };
    }
    campos[clave] = n;
  }

  if (b.opening_balance !== undefined) {
    const n = Number(b.opening_balance === '' || b.opening_balance === null ? 0 : b.opening_balance);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: 'El saldo inicial no puede ser negativo.' };
    }
    campos.opening_balance = n;
  }

  if (b.opening_date !== undefined) {
    if (b.opening_date === null || b.opening_date === '') {
      campos.opening_date = null;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.opening_date))) {
      return { ok: false, error: 'La fecha del saldo inicial es inválida.' };
    } else {
      campos.opening_date = String(b.opening_date);
    }
  }

  if (b.alerts !== undefined) campos.alerts = Boolean(b.alerts);

  return { ok: true, campos };
}
