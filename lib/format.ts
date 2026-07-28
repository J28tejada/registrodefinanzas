import { DEFAULT_SETTINGS, UserSettings } from './types';

export type FormatConfig = Pick<UserSettings, 'currency' | 'locale' | 'timezone'>;

export interface Formatters {
  config: FormatConfig;
  /** Monto con el símbolo de la moneda del usuario. */
  money(amount: number): string;
  /** Monto sin símbolo: para lo que va al modelo, donde el símbolo es ruido. */
  amount(amount: number): string;
  /** Una fecha YYYY-MM-DD, legible. */
  date(iso: string): string;
  /** YYYY-MM-DD de hoy en la zona del usuario. */
  today(): string;
  /** "lunes, 28 de julio de 2026, 21:04" — para que el modelo resuelva "ayer". */
  now(): string;
  /** Nombre del mes de un YYYY-MM-DD. */
  monthLabel(iso: string): string;
}

/**
 * Ningún formato está fijo en el código: todo sale de lo que el usuario eligió
 * en Configuración. Si la moneda o el locale no son válidos, se cae a los
 * valores por defecto en vez de reventar la pantalla.
 */
export function makeFormatters(config?: Partial<FormatConfig> | null): Formatters {
  const resuelto: FormatConfig = {
    currency: config?.currency || DEFAULT_SETTINGS.currency,
    locale: config?.locale || DEFAULT_SETTINGS.locale,
    timezone: config?.timezone || DEFAULT_SETTINGS.timezone,
  };

  const money = crearFormatoMoneda(resuelto);
  const numero = crearFormatoNumero(resuelto.locale);

  return {
    config: resuelto,
    money: (amount: number) => money.format(amount),
    amount: (amount: number) => numero.format(amount),
    date: (iso: string) => formatearFecha(iso, resuelto),
    today: () => hoyEnZona(resuelto.timezone),
    now: () => ahoraEnZona(resuelto),
    monthLabel: (iso: string) => etiquetaDeMes(iso, resuelto),
  };
}

function crearFormatoMoneda(c: FormatConfig): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(c.locale, {
      style: 'currency',
      currency: c.currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return new Intl.NumberFormat(DEFAULT_SETTINGS.locale, {
      style: 'currency',
      currency: DEFAULT_SETTINGS.currency,
      minimumFractionDigits: 2,
    });
  }
}

function crearFormatoNumero(locale: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  } catch {
    return new Intl.NumberFormat(DEFAULT_SETTINGS.locale, { maximumFractionDigits: 2 });
  }
}

function formatearFecha(iso: string, c: FormatConfig): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  // La fecha es un día calendario, no un instante: se arma en UTC y se muestra
  // en UTC, para que no se corra un día según la zona.
  try {
    return new Intl.DateTimeFormat(c.locale, {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return iso;
  }
}

function etiquetaDeMes(iso: string, c: FormatConfig): string {
  const [y, m] = iso.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(c.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return iso.slice(0, 7);
  }
}

/**
 * "Hoy" depende de dónde está el usuario, no de dónde corre el servidor.
 * Vercel corre en UTC: sin esto, un gasto de las nueve de la noche en Santo
 * Domingo queda anotado al día siguiente.
 */
export function hoyEnZona(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function ahoraEnZona(c: FormatConfig): string {
  try {
    return new Intl.DateTimeFormat(c.locale, {
      timeZone: c.timezone, dateStyle: 'full', timeStyle: 'short',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}

// ─── Ayudas de fechas ─────────────────────────────────────────────────────────

/** Primer y último día del mes al que pertenece una fecha YYYY-MM-DD. */
export function limitesDelMes(iso: string): { start: string; end: string } {
  const [y, m] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(ultimo)}` };
}

/** Valida una fecha YYYY-MM-DD; si no lo es, devuelve el reemplazo. */
export function fechaValida(valor: unknown, reemplazo: string): string {
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      return valor;
    }
  }
  return reemplazo;
}

/** Zonas horarias disponibles, para el selector de Configuración. */
export function zonasHorarias(): string[] {
  const soportadas = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (typeof soportadas === 'function') {
    try {
      return soportadas('timeZone');
    } catch {
      // sigue al fallback
    }
  }
  return [
    'America/Santo_Domingo', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Mexico_City', 'America/Bogota', 'America/Lima',
    'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
    'America/Panama', 'America/Caracas', 'Europe/Madrid', 'Europe/London',
    'Europe/Berlin', 'Europe/Paris', 'Africa/Lagos', 'Asia/Dubai', 'Asia/Kolkata',
    'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
  ];
}
