/**
 * Audio e imagen se convierten a texto y siguen el camino normal (§5.8):
 * no hay flujo paralelo, así heredan confirmación, agrupado y trazabilidad.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODEL, geminiApiKey } from './config';
import { getBase64FromMediaMessage } from './evolution';
import { guardarMedia } from './db';

/** WhatsApp manda "audio/ogg; codecs=opus"; Gemini quiere el tipo pelado. */
function mimeLimpio(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

async function generar(mimeType: string, base64: string, prompt: string): Promise<string> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error('Falta GOOGLE_AI_API_KEY: no puedo leer audios ni fotos.');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: MODEL });
  const result = await model.generateContent([
    { inlineData: { mimeType: mimeLimpio(mimeType), data: base64 } },
    { text: prompt },
  ]);
  return result.response.text().trim();
}

const PROMPT_AUDIO = `Transcribí este audio de forma LITERAL, palabra por palabra, en español.
No corrijas, no resumas, no interpretes, no agregues nada. Si no se entiende algo, escribí [inaudible].
Devolvé solo la transcripción.`;

const PROMPT_IMAGEN = `Es la foto de un recibo, factura o comprobante. Describí en UNA línea lo que dice,
incluyendo comercio, monto total y fecha si se ven. Copiá los números tal cual aparecen, no los redondees
ni los conviertas. Si no se distingue un dato, no lo inventes: omitilo.
Devolvé solo esa línea, sin comentarios.`;

export interface MedioLeido {
  /** El texto que entra al flujo normal como si lo hubiera escrito el usuario. */
  texto: string;
  /** Lo que mostramos para que detecte una lectura errada ANTES de confirmar (§5.7). */
  eco: string;
  /** Ruta del comprobante guardado, si era una imagen. */
  receiptUrl: string | null;
}

export async function transcribirAudio(mensajeCrudo: unknown): Promise<MedioLeido> {
  const { base64, mimetype } = await getBase64FromMediaMessage(mensajeCrudo);
  const texto = await generar(mimetype, base64, PROMPT_AUDIO);
  if (!texto) throw new Error('La transcripción vino vacía.');
  return {
    texto,
    eco: `🎤 Escuché: "${texto}"`,
    receiptUrl: null,
  };
}

export async function leerImagen(
  mensajeCrudo: unknown,
  phone: string,
  caption: string,
): Promise<MedioLeido> {
  const { base64, mimetype } = await getBase64FromMediaMessage(mensajeCrudo);

  // Guardar ANTES de leer y aunque la lectura falle: un recibo que se lee y se
  // descarta pierde justo la evidencia (§5.8).
  const mediaId = await guardarMedia(phone, mimeLimpio(mimetype), base64);
  const receiptUrl = `/api/whatsapp/media/${mediaId}`;

  let lectura: string;
  try {
    lectura = await generar(mimetype, base64, PROMPT_IMAGEN);
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`No pude leer la foto: ${detalle}`), { receiptUrl });
  }

  const texto = caption.trim() ? `${caption.trim()}\n${lectura}` : lectura;
  return {
    texto,
    eco: `🧾 Leí: "${lectura}"`,
    receiptUrl,
  };
}
