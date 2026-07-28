/**
 * Cliente de la Bot API de Telegram.
 *
 * Mucho más simple que WhatsApp: Telegram le pega directo a tu HTTPS público,
 * así que no hace falta ni servidor propio ni túnel. Y un mismo bot atiende a
 * muchos usuarios —cada chat tiene su id—, con lo cual desaparece el problema
 * de "una instancia por número" que sí tiene Evolution.
 */
import { MedioDescargado, MensajeEntrante } from '../types';

const API = 'https://api.telegram.org';
/** Telegram no acepta archivos de más de 20 MB por getFile. */
const MAX_BYTES = 20 * 1024 * 1024;

export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export function requireToken(): string {
  const token = telegramToken();
  if (!token) throw new Error('Falta TELEGRAM_BOT_TOKEN: creá el bot con @BotFather y cargá el token.');
  return token;
}

async function call<T>(metodo: string, body?: unknown): Promise<T> {
  const token = requireToken();
  const res = await fetch(`${API}/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !data?.ok) {
    // El motivo de Telegram, no un "falló": suele decir exactamente qué pasa.
    throw new Error(`Telegram ${metodo} → ${res.status}: ${data?.description ?? 'sin detalle'}`);
  }
  return data.result as T;
}

// ─── Bot ──────────────────────────────────────────────────────────────────────

export interface BotInfo {
  id: number;
  username: string;
  first_name: string;
}

export function getMe(): Promise<BotInfo> {
  return call<BotInfo>('getMe');
}

export function webhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  return `${base}/api/telegram/webhook`;
}

/**
 * El `secret_token` viaja en la cabecera X-Telegram-Bot-Api-Secret-Token de
 * cada update. Es lo que impide que cualquiera le postee al webhook.
 */
export function setWebhook() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('Falta TELEGRAM_WEBHOOK_SECRET: sin él el webhook queda abierto.');

  return call<boolean>('setWebhook', {
    url: webhookUrl(),
    secret_token: secret,
    // Solo mensajes: nada de ediciones, canales ni callbacks.
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
}

export function deleteWebhook() {
  return call<boolean>('deleteWebhook', { drop_pending_updates: true });
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
}

export function getWebhookInfo(): Promise<WebhookInfo> {
  return call<WebhookInfo>('getWebhookInfo');
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export function sendMessage(chatId: string, text: string) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    // Sin parse_mode: los montos y descripciones del usuario pueden traer
    // guiones bajos o asteriscos, y con Markdown el mensaje falla o se deforma.
    disable_web_page_preview: true,
  });
}

/** Le muestra "escribiendo…" mientras el modelo piensa. */
export async function sendTyping(chatId: string) {
  try {
    await call('sendChatAction', { chat_id: chatId, action: 'typing' });
  } catch {
    // Es cosmético: si falla, el mensaje igual sale.
  }
}

// ─── Medios ───────────────────────────────────────────────────────────────────

interface TelegramFile {
  file_id: string;
  file_path?: string;
  file_size?: number;
}

/** Descarga un archivo por su file_id. Telegram los sirve sin cifrar. */
export async function descargarArchivo(fileId: string, mimeType: string): Promise<MedioDescargado> {
  const token = requireToken();
  const file = await call<TelegramFile>('getFile', { file_id: fileId });
  if (!file.file_path) throw new Error('Telegram no devolvió la ruta del archivo.');
  if ((file.file_size ?? 0) > MAX_BYTES) {
    throw new Error(`El archivo pesa ${Math.round((file.file_size ?? 0) / 1048576)} MB y el máximo son 20 MB.`);
  }

  const res = await fetch(`${API}/file/bot${token}/${file.file_path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No se pudo descargar el archivo: HTTP ${res.status}`);

  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    mimeType: res.headers.get('content-type') || mimeType,
  };
}

// ─── Lectura del update ───────────────────────────────────────────────────────

type Json = Record<string, unknown>;

export interface EntranteTelegram extends MensajeEntrante {
  /** file_id del audio o la foto, para descargarlo después. */
  fileId: string | null;
  mimeType: string;
}

/**
 * Normaliza un update de Telegram. Devuelve null para lo que no nos interesa:
 * ediciones, mensajes de canales o grupos, y cualquier cosa sin chat privado.
 */
export function interpretarUpdate(update: Json): EntranteTelegram | null {
  const message = update.message as Json | undefined;
  if (!message) return null;

  const chat = message.chat as Json | undefined;
  const chatId = chat?.id;
  if (chatId == null) return null;

  // Solo chats privados: el agente le responde al dueño de la plata y a nadie más.
  if (chat?.type !== 'private') return null;

  const from = message.from as Json | undefined;
  if (from?.is_bot === true) return null;

  const externalId = String(chatId);
  const providerMessageId = message.message_id != null ? `${externalId}:${message.message_id}` : null;
  const base = { channel: 'telegram' as const, externalId, providerMessageId, fileId: null, mimeType: '' };

  const texto = typeof message.text === 'string' ? message.text.trim() : '';
  if (texto) {
    return { ...base, tipo: 'texto', texto, descripcionTipo: 'texto' };
  }

  // Nota de voz o audio suelto.
  const voice = (message.voice ?? message.audio) as Json | undefined;
  if (voice?.file_id) {
    return {
      ...base,
      tipo: 'audio',
      texto: '',
      descripcionTipo: 'nota de voz',
      fileId: voice.file_id as string,
      mimeType: (voice.mime_type as string) || 'audio/ogg',
    };
  }

  // Las fotos vienen en varios tamaños; el último es el más grande.
  const photos = message.photo as Json[] | undefined;
  if (Array.isArray(photos) && photos.length > 0) {
    const mayor = photos[photos.length - 1];
    return {
      ...base,
      tipo: 'imagen',
      texto: typeof message.caption === 'string' ? message.caption : '',
      descripcionTipo: 'foto',
      fileId: mayor.file_id as string,
      mimeType: 'image/jpeg',
    };
  }

  // Una foto mandada "como archivo" llega en document, sin comprimir.
  const documento = message.document as Json | undefined;
  const docMime = (documento?.mime_type as string) ?? '';
  if (documento?.file_id && docMime.startsWith('image/')) {
    return {
      ...base,
      tipo: 'imagen',
      texto: typeof message.caption === 'string' ? message.caption : '',
      descripcionTipo: 'foto',
      fileId: documento.file_id as string,
      mimeType: docMime,
    };
  }

  const tipoCrudo = ['sticker', 'video', 'video_note', 'document', 'location', 'contact', 'poll']
    .find(k => message[k] != null) ?? 'desconocido';
  return { ...base, tipo: 'no-soportado', texto: '', descripcionTipo: tipoCrudo };
}
