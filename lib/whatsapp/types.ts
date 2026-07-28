import { Ledger, TransactionScope, TransactionType, UserSettings } from '@/lib/types';
import { Formatters } from '@/lib/format';
import { Db } from '@/lib/db';

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
  phone: string;
  kind: PendingKind;
  payload: PendingPayload;
  summary: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string | null;
}

export interface WhatsappNumber {
  id: string;
  user_id: string;
  phone: string;
  ledger_id: string | null;
  active: boolean;
  created_at: string;
}

export interface WhatsappMessage {
  id: string;
  phone: string;
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
  numero: WhatsappNumber;
  settings: UserSettings;
  fmt: Formatters;
  ledger: Ledger | null;
  scope: TransactionScope;
}

export function tipoToTransactionType(tipo: MovimientoPropuesto['tipo']): TransactionType {
  return tipo === 'ingreso' ? 'income' : 'expense';
}
