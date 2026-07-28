/** Config compartida del agente de WhatsApp. */

/** Modelo de Gemini. Mientras estés en tier gratuito, usá una variante lite. */
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

export function geminiApiKey(): string | null {
  return process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || null;
}

/** Minutos que vive una acción pendiente antes de expirar. */
export const PENDING_TTL_MIN = 30;
/** Minutos que vive un código de vinculación. */
export const LINK_CODE_TTL_MIN = 15;

/** DD/MM corto, para los resúmenes que van al modelo y al usuario. */
export function fechaCorta(fecha: string): string {
  const [, m, d] = fecha.split('-');
  return `${d}/${m}`;
}
