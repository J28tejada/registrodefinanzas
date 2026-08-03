/**
 * Cliente de Evolution API (self-hosted, Baileys).
 * Toda llamada lleva el header `apikey`.
 */
import { MedioDescargado } from '../types';

export interface EvolutionConfig {
  url: string;
  apiKey: string;
  instance: string;
}

export function evolutionConfig(): EvolutionConfig | null {
  const url = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !apiKey || !instance) return null;
  return { url, apiKey, instance };
}

/** Config o error explícito: nunca un fallo mudo (§5.6). */
export function requireEvolution(): EvolutionConfig {
  const cfg = evolutionConfig();
  if (!cfg) {
    const faltan = [
      !process.env.EVOLUTION_API_URL && 'EVOLUTION_API_URL',
      !process.env.EVOLUTION_API_KEY && 'EVOLUTION_API_KEY',
      !process.env.EVOLUTION_INSTANCE && 'EVOLUTION_INSTANCE',
    ].filter(Boolean).join(', ');
    throw new Error(`Evolution no está configurado. Faltan variables: ${faltan}`);
  }
  return cfg;
}

async function call<T>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const cfg = requireEvolution();
  const res = await fetch(`${cfg.url}${path}`, {
    method,
    headers: {
      apikey: cfg.apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Evolution ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ─── Instancia ────────────────────────────────────────────────────────────────

export async function createInstance() {
  const cfg = requireEvolution();
  return call<Record<string, unknown>>('POST', '/instance/create', {
    instanceName: cfg.instance,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  });
}

export interface ConnectResult {
  /** Data URI del QR, cuando Evolution lo devuelve. */
  qr: string | null;
  /** Código de emparejamiento: la vía principal en móvil (§6.5). */
  pairingCode: string | null;
}

/**
 * Pide QR o código de emparejamiento. Si le pasás `number`, Evolution devuelve
 * un pairingCode — imprescindible cuando la app y WhatsApp están en el mismo
 * teléfono y no hay una segunda pantalla que escanear.
 */
export async function connectInstance(number?: string): Promise<ConnectResult> {
  const cfg = requireEvolution();
  const qs = number ? `?number=${encodeURIComponent(number)}` : '';
  const data = await call<Record<string, unknown>>('GET', `/instance/connect/${cfg.instance}${qs}`);
  const base64 = (data.base64 as string) ?? (data.qrcode as Record<string, string>)?.base64 ?? null;
  return {
    qr: base64 ? (base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`) : null,
    pairingCode: (data.pairingCode as string) ?? (data.code as string) ?? null,
  };
}

/** 'open' | 'connecting' | 'close'. Las sesiones de Baileys se caen solas (§6.4). */
export async function connectionState(): Promise<string> {
  const cfg = requireEvolution();
  const data = await call<Record<string, unknown>>('GET', `/instance/connectionState/${cfg.instance}`);
  const inst = data.instance as Record<string, unknown> | undefined;
  return (inst?.state as string) ?? (data.state as string) ?? 'unknown';
}

/**
 * El número del bot, tal como quedó al emparejar. Sale de `ownerJid`, así que
 * no hay que configurarlo aparte ni mantenerlo sincronizado a mano: si algún
 * día se empareja otro teléfono, esto lo sigue solo.
 *
 * Devuelve null mientras la instancia no esté conectada — ahí el dato todavía
 * no existe, y un enlace al bot no llevaría a ninguna parte.
 */
export async function instanceOwnerNumber(): Promise<string | null> {
  const cfg = requireEvolution();
  const data = await call<unknown>(
    'GET',
    `/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`,
  );
  // Según la versión, Evolution devuelve la instancia sola o una lista.
  const lista = Array.isArray(data) ? data : [data];
  const inst = lista.find(
    (i): i is Record<string, unknown> =>
      typeof i === 'object' && i !== null && (i as Record<string, unknown>).name === cfg.instance,
  );
  const ownerJid = inst?.ownerJid;
  if (typeof ownerJid !== 'string') return null;
  return ownerJid.split('@')[0].split(':')[0] || null;
}

export async function logoutInstance() {
  const cfg = requireEvolution();
  return call('DELETE', `/instance/logout/${cfg.instance}`);
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export function webhookUrl(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
  return `${base}/api/whatsapp/webhook${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

/**
 * §6.1: `webhookByEvents` DEBE ir en false. Con true, Evolution le agrega el
 * nombre del evento al final de la URL y el webhook nunca recibe nada.
 * El cuerpo va anidado bajo la clave `webhook`.
 */
export async function setWebhook() {
  const cfg = requireEvolution();
  return call<Record<string, unknown>>('POST', `/webhook/set/${cfg.instance}`, {
    webhook: {
      enabled: true,
      url: webhookUrl(),
      webhookByEvents: false,
      // No lo actives: engordaría TODOS los webhooks, también los de texto,
      // que son la mayoría. Los medios se piden aparte.
      webhookBase64: false,
      events: ['MESSAGES_UPSERT'],
    },
  });
}

export async function getWebhook(): Promise<Record<string, unknown> | null> {
  const cfg = requireEvolution();
  try {
    return await call<Record<string, unknown>>('GET', `/webhook/find/${cfg.instance}`);
  } catch {
    return null;
  }
}

// ─── Mensajes ─────────────────────────────────────────────────────────────────

export async function sendText(phone: string, text: string) {
  const cfg = requireEvolution();
  return call('POST', `/message/sendText/${cfg.instance}`, { number: phone, text });
}

/**
 * Audio e imágenes viajan cifrados extremo a extremo: la URL del webhook apunta
 * a un `.enc` que solo Evolution puede descifrar. Hay que pedirle el archivo
 * mandándole el mensaje completo tal como llegó.
 */
export async function getBase64FromMediaMessage(message: unknown): Promise<MedioDescargado> {
  const cfg = requireEvolution();
  const data = await call<Record<string, unknown>>(
    'POST',
    `/chat/getBase64FromMediaMessage/${cfg.instance}`,
    { message },
  );
  const base64 = (data.base64 as string) ?? '';
  if (!base64) throw new Error('Evolution devolvió el medio sin base64');
  return {
    bytes: new Uint8Array(Buffer.from(base64, 'base64')),
    mimeType: (data.mimetype as string) ?? 'application/octet-stream',
  };
}
