import { getPool } from '@/lib/db';
import {
  PendingAction,
  PendingKind,
  PendingPayload,
  WhatsappLinkCode,
  WhatsappMessage,
  WhatsappNumber,
} from './types';

/** Minutos que vive una acción pendiente antes de expirar (§5.1). */
export const PENDING_TTL_MIN = 30;
/** Minutos que vive un código de vinculación. */
export const LINK_CODE_TTL_MIN = 15;

let initialized = false;

export async function initWhatsapp() {
  if (initialized) return;
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_numbers (
      id          TEXT PRIMARY KEY,
      phone       TEXT NOT NULL UNIQUE,
      ledger_id   TEXT,
      label       TEXT NOT NULL DEFAULT '',
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_link_codes (
      id          TEXT PRIMARY KEY,
      code        TEXT NOT NULL UNIQUE,
      ledger_id   TEXT,
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bitácora del chat: de acá sale el contexto del agente.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id            TEXT PRIMARY KEY,
      phone         TEXT NOT NULL,
      wa_message_id TEXT,
      direction     TEXT NOT NULL CHECK (direction IN ('in','out')),
      body          TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_idx ON whatsapp_messages (phone, created_at DESC)`,
  );
  // Evolution puede reenviar el mismo mensaje: el id de WhatsApp es la defensa.
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_wa_id_idx
       ON whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      id          TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      kind        TEXT NOT NULL,
      payload     JSONB NOT NULL,
      summary     TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','confirmed','cancelled','expired')),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ
    )
  `);
  // Una sola pendiente viva por teléfono: con dos, un "sí" es ambiguo (§5.1).
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS pending_actions_one_live_per_phone
       ON pending_actions (phone) WHERE status = 'pending'`,
  );

  // Los recibos se guardan ANTES de leerlos y aunque la lectura falle (§5.8).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_media (
      id          TEXT PRIMARY KEY,
      phone       TEXT NOT NULL,
      mime_type   TEXT NOT NULL,
      data        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  initialized = true;
}

// ─── Números vinculados ───────────────────────────────────────────────────────

function rowToNumber(row: Record<string, unknown>): WhatsappNumber {
  return {
    id: row.id as string,
    phone: row.phone as string,
    ledger_id: (row.ledger_id as string) ?? null,
    label: (row.label as string) ?? '',
    active: Boolean(row.active),
    created_at: new Date(row.created_at as string).toISOString(),
  };
}

export async function getNumberByPhone(phone: string): Promise<WhatsappNumber | null> {
  await initWhatsapp();
  const { rows } = await getPool().query(
    'SELECT * FROM whatsapp_numbers WHERE phone = $1 AND active = TRUE',
    [phone],
  );
  return rows[0] ? rowToNumber(rows[0]) : null;
}

export async function getAllNumbers(): Promise<WhatsappNumber[]> {
  await initWhatsapp();
  const { rows } = await getPool().query(
    'SELECT * FROM whatsapp_numbers ORDER BY created_at ASC',
  );
  return rows.map(rowToNumber);
}

export async function unlinkNumber(id: string): Promise<boolean> {
  await initWhatsapp();
  const res = await getPool().query('DELETE FROM whatsapp_numbers WHERE id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function setNumberLedger(id: string, ledgerId: string | null): Promise<void> {
  await initWhatsapp();
  await getPool().query('UPDATE whatsapp_numbers SET ledger_id = $1 WHERE id = $2', [ledgerId, id]);
}

// ─── Códigos de vinculación ───────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1

export async function createLinkCode(ledgerId: string | null): Promise<WhatsappLinkCode> {
  await initWhatsapp();
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MIN * 60_000).toISOString();

  // Un código vivo a la vez: los anteriores dejan de servir.
  await getPool().query(
    `UPDATE whatsapp_link_codes SET used_at = NOW() WHERE used_at IS NULL`,
  );
  await getPool().query(
    `INSERT INTO whatsapp_link_codes (id, code, ledger_id, expires_at) VALUES ($1, $2, $3, $4)`,
    [id, code, ledgerId, expiresAt],
  );
  return { id, code, ledger_id: ledgerId, expires_at: expiresAt, used_at: null, created_at: new Date().toISOString() };
}

/**
 * Consume un código y vincula el teléfono. Devuelve null si el código no existe,
 * ya se usó o venció.
 */
export async function consumeLinkCode(code: string, phone: string): Promise<WhatsappNumber | null> {
  await initWhatsapp();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE whatsapp_link_codes SET used_at = NOW()
      WHERE code = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING *`,
    [code.toUpperCase()],
  );
  if (!rows[0]) return null;

  const ledgerId = (rows[0].ledger_id as string) ?? null;
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO whatsapp_numbers (id, phone, ledger_id, active)
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (phone) DO UPDATE SET ledger_id = EXCLUDED.ledger_id, active = TRUE`,
    [id, phone, ledgerId],
  );
  return (await getNumberByPhone(phone))!;
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────

/**
 * Guarda un mensaje entrante y devuelve su id. Devuelve null si ese mensaje de
 * WhatsApp ya estaba registrado: Evolution reintenta los webhooks y sin esto un
 * mismo "sí" se procesaría dos veces.
 */
export async function logInbound(phone: string, body: string, waMessageId: string | null): Promise<string | null> {
  await initWhatsapp();
  const id = crypto.randomUUID();
  const { rows } = await getPool().query(
    `INSERT INTO whatsapp_messages (id, phone, wa_message_id, direction, body)
     VALUES ($1, $2, $3, 'in', $4)
     ON CONFLICT (wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [id, phone, waMessageId, body],
  );
  return rows[0] ? (rows[0].id as string) : null;
}

/** El cuerpo definitivo de un audio o una foto se sabe recién tras leerlos. */
export async function actualizarCuerpoMensaje(id: string, body: string): Promise<void> {
  await initWhatsapp();
  await getPool().query('UPDATE whatsapp_messages SET body = $2 WHERE id = $1', [id, body]);
}

export async function logOutbound(phone: string, body: string): Promise<void> {
  await initWhatsapp();
  await getPool().query(
    `INSERT INTO whatsapp_messages (id, phone, wa_message_id, direction, body)
     VALUES ($1, $2, NULL, 'out', $3)`,
    [crypto.randomUUID(), phone, body],
  );
}

/** Últimos mensajes en orden cronológico, para armar el contexto del agente. */
export async function recentMessages(phone: string, limit = 10): Promise<WhatsappMessage[]> {
  await initWhatsapp();
  const { rows } = await getPool().query(
    `SELECT * FROM (
       SELECT * FROM whatsapp_messages WHERE phone = $1 ORDER BY created_at DESC LIMIT $2
     ) t ORDER BY created_at ASC`,
    [phone, limit],
  );
  return rows.map(r => ({
    id: r.id as string,
    phone: r.phone as string,
    direction: r.direction as 'in' | 'out',
    body: r.body as string,
    created_at: new Date(r.created_at as string).toISOString(),
  }));
}

// ─── Acciones pendientes ──────────────────────────────────────────────────────

function rowToPending(row: Record<string, unknown>): PendingAction {
  return {
    id: row.id as string,
    phone: row.phone as string,
    kind: row.kind as PendingKind,
    payload: row.payload as PendingPayload,
    summary: (row.summary as string) ?? '',
    status: row.status as PendingAction['status'],
    created_at: new Date(row.created_at as string).toISOString(),
    expires_at: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
  };
}

/** La pendiente viva del teléfono, si no venció. Marca las vencidas de paso. */
export async function pendienteVigente(phone: string): Promise<PendingAction | null> {
  await initWhatsapp();
  const pool = getPool();
  await pool.query(
    `UPDATE pending_actions SET status = 'expired'
      WHERE phone = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    [phone],
  );
  const { rows } = await pool.query(
    `SELECT * FROM pending_actions WHERE phone = $1 AND status = 'pending' LIMIT 1`,
    [phone],
  );
  return rows[0] ? rowToPending(rows[0]) : null;
}

/** Crea una pendiente nueva, descartando cualquier otra viva del mismo teléfono. */
export async function crearPendiente(
  phone: string,
  kind: PendingKind,
  payload: PendingPayload,
  summary: string,
): Promise<PendingAction> {
  await initWhatsapp();
  const pool = getPool();
  await pool.query(
    `UPDATE pending_actions SET status = 'cancelled' WHERE phone = $1 AND status = 'pending'`,
    [phone],
  );
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MIN * 60_000).toISOString();
  const { rows } = await pool.query(
    `INSERT INTO pending_actions (id, phone, kind, payload, summary, expires_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`,
    [id, phone, kind, JSON.stringify(payload), summary, expiresAt],
  );
  return rowToPending(rows[0]);
}

export async function actualizarPendiente(
  id: string,
  payload: PendingPayload,
  summary: string,
): Promise<PendingAction> {
  await initWhatsapp();
  const { rows } = await getPool().query(
    `UPDATE pending_actions SET payload = $2::jsonb, summary = $3 WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(payload), summary],
  );
  return rowToPending(rows[0]);
}

export async function cerrarPendiente(
  id: string,
  status: 'confirmed' | 'cancelled' | 'expired',
): Promise<void> {
  await initWhatsapp();
  await getPool().query(`UPDATE pending_actions SET status = $2 WHERE id = $1`, [id, status]);
}

// ─── Medios ───────────────────────────────────────────────────────────────────

export async function guardarMedia(phone: string, mimeType: string, base64: string): Promise<string> {
  await initWhatsapp();
  const id = crypto.randomUUID();
  await getPool().query(
    `INSERT INTO whatsapp_media (id, phone, mime_type, data) VALUES ($1, $2, $3, $4)`,
    [id, phone, mimeType, base64],
  );
  return id;
}

export async function obtenerMedia(id: string): Promise<{ mimeType: string; base64: string } | null> {
  await initWhatsapp();
  const { rows } = await getPool().query(
    'SELECT mime_type, data FROM whatsapp_media WHERE id = $1',
    [id],
  );
  if (!rows[0]) return null;
  return { mimeType: rows[0].mime_type as string, base64: rows[0].data as string };
}
