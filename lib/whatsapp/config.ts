/** Config compartida del agente de WhatsApp. */

/**
 * Zona horaria con la que se resuelven "hoy", "ayer" y "el viernes".
 * Vercel corre en UTC: sin esto, un gasto de las 9 de la noche queda al día
 * siguiente. Por defecto va la zona que corresponde al formato es-MX/MXN que
 * usa el resto de la app.
 */
export const TIMEZONE = process.env.WHATSAPP_TIMEZONE || 'America/Mexico_City';

/** Modelo de Gemini. Mientras estés en tier gratuito, usá una variante lite (§6.3). */
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

export function geminiApiKey(): string | null {
  return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
}

/** YYYY-MM-DD de hoy en la zona configurada. */
export function hoyLocal(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Fecha y hora local legible, para que el modelo resuelva fechas relativas. */
export function ahoraLocal(): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
}

/** Normaliza una fecha del modelo: si no es una YYYY-MM-DD válida, va hoy. */
export function fechaValida(fecha: unknown): string {
  if (typeof fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d) {
      return fecha;
    }
  }
  return hoyLocal();
}

/** Suma días a una fecha YYYY-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** DD-MM corto, para los resúmenes que van al modelo y al usuario. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}
