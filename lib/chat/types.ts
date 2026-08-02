import { Ledger, TransactionScope, TransactionType, UserSettings } from '@/lib/types';
import { Formatters } from '@/lib/format';
import { Db } from '@/lib/db';

/** Por dónde entró el mensaje. Nada de lo que decide qué se registra depende de esto. */
export type Channel = 'whatsapp' | 'telegram';

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
};

/** Un movimiento propuesto por el agente, todavía sin escribir. */
export interface MovimientoPropuesto {
  tipo: 'ingreso' | 'gasto';
  /** Monto de CADA unidad, no el total. */
  monto: number;
  descripcion: string;
  categoria: string;
  /** YYYY-MM-DD */
  fecha: string;
  metodo_pago: string | null;
  /** Cuántas unidades. 1 en el caso normal. */
  cantidad: number;
  /**
   * null = falta preguntarle al usuario si van juntas o separadas.
   * Nunca lo decide el modelo.
   */
  agrupar: boolean | null;
  /** Ruta del comprobante en el storage, si el movimiento nació de una foto. */
  receipt_url: string | null;
}

export type PendingKind = 'registrar_movimientos';

export interface PendingPayload {
  movimientos: MovimientoPropuesto[];
}

export interface PendingAction {
  id: string;
  user_id: string;
  channel: Channel;
  external_id: string;
  kind: PendingKind;
  payload: PendingPayload;
  summary: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string | null;
}

/** Una conversación autorizada: un número de WhatsApp o un chat de Telegram. */
export interface ChatLink {
  id: string;
  user_id: string;
  channel: Channel;
  external_id: string;
  ledger_id: string | null;
  active: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  channel: Channel;
  external_id: string;
  direction: 'in' | 'out';
  body: string;
  created_at: string;
}

/**
 * Todo lo que hace falta para atender un mensaje: quién es, con qué moneda y
 * zona horaria trabaja, y en qué cuenta se anota.
 */
export interface Contexto {
  db: Db;
  link: ChatLink;
  settings: UserSettings;
  fmt: Formatters;
  ledger: Ledger | null;
  scope: TransactionScope;
}

/** Un mensaje entrante, ya normalizado por el transporte del canal. */
export interface MensajeEntrante {
  channel: Channel;
  /** Teléfono o chat_id: identifica la conversación dentro del canal. */
  externalId: string;
  /**
   * A dónde contestar, tal cual lo mandó el proveedor.
   *
   * En WhatsApp no siempre coincide con `externalId`: desde 2025 las cuentas
   * usan direccionamiento LID (`147...@lid`), un identificador que reemplaza al
   * teléfono. Rearmar el destino como `<externalId>@s.whatsapp.net` da un JID
   * que no existe y el envío devuelve 400. Sin esto, el mensaje entra pero la
   * respuesta nunca sale.
   */
  replyTo?: string;
  /** Id del mensaje en el proveedor, para no procesarlo dos veces. */
  providerMessageId: string | null;
  tipo: 'texto' | 'audio' | 'imagen' | 'no-soportado';
  texto: string;
  /** Cómo describirle al usuario lo que mandó, cuando no lo podemos leer. */
  descripcionTipo: string;
}

/** Un medio ya descargado y descifrado por el transporte. */
export interface MedioDescargado {
  bytes: Uint8Array;
  mimeType: string;
}

export function tipoToTransactionType(tipo: MovimientoPropuesto['tipo']): TransactionType {
  return tipo === 'ingreso' ? 'income' : 'expense';
}
