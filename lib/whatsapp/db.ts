/**
 * Acceso a las tablas del agente.
 *
 * El webhook no trae sesión de navegador, así que entra con la service role
 * (que salta RLS) y resuelve el usuario a partir del teléfono vinculado. Por
 * eso acá el `user_id` se filtra a mano siempre: es lo único que separa a un
 * usuario de otro en este camino.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { LINK_CODE_TTL_MIN, PENDING_TTL_MIN } from './config';
import {
  PendingAction,
  PendingKind,
  PendingPayload,
  WhatsappMessage,
  WhatsappNumber,
} from './types';

export function adminDb(): SupabaseClient {
  return createAdminClient();
}

function fallar(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`);
}

// ─── Números vinculados ───────────────────────────────────────────────────────

function rowToNumber(row: Record<string, unknown>): WhatsappNumber {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    phone: row.phone as string,
    ledger_id: (row.ledger_id as string) ?? null,
    active: Boolean(row.active),
    created_at: row.created_at as string,
  };
}

/** Quién es el dueño de este teléfono. null = no está autorizado. */
export async function getNumberByPhone(
  supabase: SupabaseClient,
  phone: string,
): Promise<WhatsappNumber | null> {
  const { data, error } = await supabase
    .from('whatsapp_numbers').select('*').eq('phone', phone).eq('active', true).maybeSingle();
  if (error) fallar('No se pudo verificar el número', error);
  return data ? rowToNumber(data) : null;
}

export async function getNumbersForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<WhatsappNumber[]> {
  const { data, error } = await supabase
    .from('whatsapp_numbers').select('*').eq('user_id', userId).order('created_at');
  if (error) fallar('No se pudieron leer los números vinculados', error);
  return (data ?? []).map(rowToNumber);
}

/** Todos los números activos, para el recordatorio del cron. */
export async function getAllActiveNumbers(supabase: SupabaseClient): Promise<WhatsappNumber[]> {
  const { data, error } = await supabase.from('whatsapp_numbers').select('*').eq('active', true);
  if (error) fallar('No se pudieron leer los números vinculados', error);
  return (data ?? []).map(rowToNumber);
}

export async function unlinkNumber(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_numbers').delete().eq('user_id', userId).eq('id', id).select('id');
  if (error) fallar('No se pudo desvincular el número', error);
  return (data ?? []).length > 0;
}

export async function setNumberLedger(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  ledgerId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_numbers').update({ ledger_id: ledgerId }).eq('user_id', userId).eq('id', id);
  if (error) fallar('No se pudo cambiar la cuenta del número', error);
}

// ─── Códigos de vinculación ───────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1

export async function createLinkCode(
  supabase: SupabaseClient,
  userId: string,
  ledgerId: string | null,
): Promise<{ code: string; expires_at: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MIN * 60_000).toISOString();

  // Un código vivo a la vez por usuario: los anteriores dejan de servir.
  await supabase
    .from('whatsapp_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error } = await supabase.from('whatsapp_link_codes').insert({
    user_id: userId,
    code,
    ledger_id: ledgerId,
    expires_at: expiresAt,
  });
  if (error) fallar('No se pudo generar el código', error);

  return { code, expires_at: expiresAt };
}

/**
 * Consume un código y vincula el teléfono al usuario que lo generó.
 * Devuelve null si el código no existe, ya se usó o venció.
 */
export async function consumeLinkCode(
  supabase: SupabaseClient,
  code: string,
  phone: string,
): Promise<WhatsappNumber | null> {
  const { data: fila, error } = await supabase
    .from('whatsapp_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code.toUpperCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select()
    .maybeSingle();
  if (error) fallar('No se pudo validar el código', error);
  if (!fila) return null;

  const { data, error: errorAlta } = await supabase
    .from('whatsapp_numbers')
    .upsert(
      {
        user_id: fila.user_id as string,
        phone,
        ledger_id: (fila.ledger_id as string) ?? null,
        active: true,
      },
      { onConflict: 'phone' },
    )
    .select()
    .single();
  if (errorAlta) fallar('No se pudo vincular el número', errorAlta);
  return rowToNumber(data);
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────

/**
 * Guarda un mensaje entrante y devuelve su id, o null si ese mensaje de
 * WhatsApp ya estaba registrado: Evolution reintenta los webhooks y sin esto un
 * mismo "sí" se procesaría dos veces.
 */
export async function logInbound(
  supabase: SupabaseClient,
  userId: string | null,
  phone: string,
  body: string,
  waMessageId: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .upsert(
      { user_id: userId, phone, wa_message_id: waMessageId, direction: 'in', body },
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) fallar('No se pudo registrar el mensaje', error);
  return data && data.length > 0 ? (data[0].id as string) : null;
}

/** El cuerpo definitivo de un audio o una foto se sabe recién tras leerlos. */
export async function actualizarCuerpoMensaje(
  supabase: SupabaseClient,
  id: string,
  body: string,
): Promise<void> {
  await supabase.from('whatsapp_messages').update({ body }).eq('id', id);
}

export async function logOutbound(
  supabase: SupabaseClient,
  userId: string | null,
  phone: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_messages')
    .insert({ user_id: userId, phone, direction: 'out', body });
  if (error) console.error('[whatsapp] no se pudo registrar la salida:', error.message);
}

/** Últimos mensajes en orden cronológico, para armar el contexto del agente. */
export async function recentMessages(
  supabase: SupabaseClient,
  phone: string,
  limit = 10,
): Promise<WhatsappMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('id, phone, direction, body, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fallar('No se pudo leer la conversación', error);
  return (data ?? [])
    .map(r => ({
      id: r.id as string,
      phone: r.phone as string,
      direction: r.direction as 'in' | 'out',
      body: r.body as string,
      created_at: r.created_at as string,
    }))
    .reverse();
}

// ─── Acciones pendientes ──────────────────────────────────────────────────────

function rowToPending(row: Record<string, unknown>): PendingAction {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    phone: row.phone as string,
    kind: row.kind as PendingKind,
    payload: row.payload as PendingPayload,
    summary: (row.summary as string) ?? '',
    status: row.status as PendingAction['status'],
    created_at: row.created_at as string,
    expires_at: (row.expires_at as string) ?? null,
  };
}

/** La pendiente viva del teléfono, si no venció. Marca las vencidas de paso. */
export async function pendienteVigente(
  supabase: SupabaseClient,
  phone: string,
): Promise<PendingAction | null> {
  const ahora = new Date().toISOString();
  await supabase
    .from('pending_actions')
    .update({ status: 'expired' })
    .eq('phone', phone)
    .eq('status', 'pending')
    .lte('expires_at', ahora);

  const { data, error } = await supabase
    .from('pending_actions').select('*').eq('phone', phone).eq('status', 'pending').maybeSingle();
  if (error) fallar('No se pudo leer la acción pendiente', error);
  return data ? rowToPending(data) : null;
}

/** Crea una pendiente nueva, descartando cualquier otra viva del mismo teléfono. */
export async function crearPendiente(
  supabase: SupabaseClient,
  userId: string,
  phone: string,
  kind: PendingKind,
  payload: PendingPayload,
  summary: string,
): Promise<PendingAction> {
  await supabase
    .from('pending_actions')
    .update({ status: 'cancelled' })
    .eq('phone', phone)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from('pending_actions')
    .insert({
      user_id: userId,
      phone,
      kind,
      payload,
      summary,
      expires_at: new Date(Date.now() + PENDING_TTL_MIN * 60_000).toISOString(),
    })
    .select()
    .single();
  if (error) fallar('No se pudo guardar la acción pendiente', error);
  return rowToPending(data);
}

export async function actualizarPendiente(
  supabase: SupabaseClient,
  id: string,
  payload: PendingPayload,
  summary: string,
): Promise<PendingAction> {
  const { data, error } = await supabase
    .from('pending_actions').update({ payload, summary }).eq('id', id).select().single();
  if (error) fallar('No se pudo actualizar la acción pendiente', error);
  return rowToPending(data);
}

export async function cerrarPendiente(
  supabase: SupabaseClient,
  id: string,
  status: 'confirmed' | 'cancelled' | 'expired',
): Promise<void> {
  const { error } = await supabase.from('pending_actions').update({ status }).eq('id', id);
  if (error) fallar('No se pudo cerrar la acción pendiente', error);
}

// ─── Comprobantes ─────────────────────────────────────────────────────────────

export const BUCKET_RECIBOS = 'receipts';

/**
 * Guarda la foto y devuelve su ruta. Se llama ANTES de leerla: un recibo que se
 * lee y se descarta pierde justo la evidencia.
 */
export async function guardarRecibo(
  supabase: SupabaseClient,
  userId: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'jpg';
  // La primera carpeta es el user_id: es lo que separa los recibos de cada uno.
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET_RECIBOS)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`No se pudo guardar el comprobante: ${error.message}`);
  return path;
}

/** URL firmada temporal para mostrar el recibo en la app. */
export async function urlFirmadaRecibo(
  supabase: SupabaseClient,
  path: string,
  segundos = 300,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET_RECIBOS).createSignedUrl(path, segundos);
  if (error) return null;
  return data.signedUrl;
}
