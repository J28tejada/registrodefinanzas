import { TransactionType } from '@/lib/types';

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
   * Nunca lo decide el modelo (ver §5.4 de la guía).
   */
  agrupar: boolean | null;
  /** Comprobante adjunto, si el movimiento nació de una foto. */
  receipt_url: string | null;
}

export type PendingKind = 'registrar_movimientos';

export interface PendingPayload {
  movimientos: MovimientoPropuesto[];
}

export interface PendingAction {
  id: string;
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
  phone: string;
  ledger_id: string | null;
  label: string;
  active: boolean;
  created_at: string;
}

export interface WhatsappLinkCode {
  id: string;
  code: string;
  ledger_id: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface WhatsappMessage {
  id: string;
  phone: string;
  direction: 'in' | 'out';
  body: string;
  created_at: string;
}

export function tipoToTransactionType(tipo: MovimientoPropuesto['tipo']): TransactionType {
  return tipo === 'ingreso' ? 'income' : 'expense';
}
