/**
 * Acceso a las tablas de los canales de chat.
 *
 * Los webhooks no traen sesión de navegador, así que entran con la service role
 * (que salta RLS) y resuelven el usuario a partir de la conversación vinculada.
 * Por eso acá el `user_id` se filtra a mano siempre: es lo único que separa a un
 * usuario de otro en este camino.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { LINK_CODE_TTL_MIN, PENDING_TTL_MIN } from './config';
import {
  Channel,
  ChatLink,
  ChatMessage,
  PendingAction,
  PendingKind,
  PendingPayload,
} from './types';

function fallar(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`);
}

// ─── Conversaciones vinculadas ────────────────────────────────────────────────

function rowToLink(row: Record<string, unknown>): ChatLink {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    channel: row.channel as Channel,
    external_id: row.external_id as string,
    ledger_id: (row.ledger_id as string) ?? null,
    active: Boolean(row.active),
    created_at: row.created_at as string,
  };
}

/** De quién es esta conversación. null = no está autorizada. */
export async function getLink(
  supabase: SupabaseClient,
  channel: Channel,
  externalId: string,
): Promise<ChatLink | null> {
  const { data, error } = await supabase
    .from('chat_links').select('*')
    .eq('channel', channel).eq('external_id', externalId).eq('active', true)
    .maybeSingle();
  if (error) fallar('No se pudo verificar la conversación', error);
  return data ? rowToLink(data) : null;
}

export async function getLinksForUser(
  supabase: SupabaseClient,
  userId: string,
  channel?: Channel,
): Promise<ChatLink[]> {
  let q = supabase.from('chat_links').select('*').eq('user_id', userId);
  if (channel) q = q.eq('channel', channel);
  const { data, error } = await q.order('created_at');
  if (error) fallar('No se pudieron leer las conversaciones vinculadas', error);
  return (data ?? []).map(rowToLink);
}

/** Todas las conversaciones activas, para el recordatorio del cron. */
export async function getAllActiveLinks(supabase: SupabaseClient): Promise<ChatLink[]> {
  const { data, error } = await supabase.from('chat_links').select('*').eq('active', true);
  if (error) fallar('No se pudieron leer las conversaciones vinculadas', error);
  return (data ?? []).map(rowToLink);
}

export async function unlink(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('chat_links').delete().eq('user_id', userId).eq('id', id).select('id');
  if (error) fallar('No se pudo desvincular', error);
  return (data ?? []).length > 0;
}

export async function setLinkLedger(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  ledgerId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('chat_links').update({ ledger_id: ledgerId }).eq('user_id', userId).eq('id', id);
  if (error) fallar('No se pudo cambiar la cuenta', error);
}

// ─── Códigos de vinculación ───────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I, O, 0, 1

/**
 * Un código sirve para cualquier canal: el usuario lo genera una vez y lo manda
 * por donde quiera. `channel` nulo significa exactamente eso.
 */
export async function createLinkCode(
  supabase: SupabaseClient,
  userId: string,
  ledgerId: string | null,
  channel: Channel | null = null,
): Promise<{ code: string; expires_at: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MIN * 60_000).toISOString();

  // Un código vivo a la vez por usuario: los anteriores dejan de servir.
  await supabase
    .from('chat_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error } = await supabase.from('chat_link_codes').insert({
    user_id: userId,
    code,
    ledger_id: ledgerId,
    channel,
    expires_at: expiresAt,
  });
  if (error) fallar('No se pudo generar el código', error);

  return { code, expires_at: expiresAt };
}

/**
 * Consume un código y vincula la conversación al usuario que lo generó.
 * Devuelve null si el código no existe, ya se usó, venció o era para otro canal.
 */
export async function consumeLinkCode(
  supabase: SupabaseClient,
  code: string,
  channel: Channel,
  externalId: string,
): Promise<ChatLink | null> {
  const { data: fila, error } = await supabase
    .from('chat_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code.toUpperCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .or(`channel.is.null,channel.eq.${channel}`)
    .select()
    .maybeSingle();
  if (error) fallar('No se pudo validar el código', error);
  if (!fila) return null;

  const { data, error: errorAlta } = await supabase
    .from('chat_links')
    .upsert(
      {
        user_id: fila.user_id as string,
        channel,
        external_id: externalId,
        ledger_id: (fila.ledger_id as string) ?? null,
        active: true,
      },
      { onConflict: 'channel,external_id' },
    )
    .select()
    .single();
  if (errorAlta) fallar('No se pudo vincular la conversación', errorAlta);
  return rowToLink(data);
}

// ─── Bitácora ─────────────────────────────────────────────────────────────────

/**
 * Guarda un mensaje entrante y devuelve su id, o null si ya estaba registrado:
 * los proveedores reintentan los webhooks y sin esto un mismo "sí" se
 * procesaría dos veces.
 */
export async function logInbound(
  supabase: SupabaseClient,
  userId: string | null,
  channel: Channel,
  externalId: string,
  body: string,
  providerMessageId: string | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .upsert(
      {
        user_id: userId,
        channel,
        external_id: externalId,
        provider_message_id: providerMessageId,
        direction: 'in',
        body,
      },
      { onConflict: 'channel,provider_message_id', ignoreDuplicates: true },
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
  await supabase.from('chat_messages').update({ body }).eq('id', id);
}

export async function logOutbound(
  supabase: SupabaseClient,
  userId: string | null,
  channel: Channel,
  externalId: string,
  body: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ user_id: userId, channel, external_id: externalId, direction: 'out', body });
  if (error) console.error('[chat] no se pudo registrar la salida:', error.message);
}

/** Últimos mensajes en orden cronológico, para armar el contexto del agente. */
export async function recentMessages(
  supabase: SupabaseClient,
  channel: Channel,
  externalId: string,
  limit = 10,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, channel, external_id, direction, body, created_at')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fallar('No se pudo leer la conversación', error);
  return (data ?? [])
    .map(r => ({
      id: r.id as string,
      channel: r.channel as Channel,
      external_id: r.external_id as string,
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
    channel: row.channel as Channel,
    external_id: row.external_id as string,
    kind: row.kind as PendingKind,
    payload: row.payload as PendingPayload,
    summary: (row.summary as string) ?? '',
    status: row.status as PendingAction['status'],
    created_at: row.created_at as string,
    expires_at: (row.expires_at as string) ?? null,
  };
}

/** La pendiente viva de la conversación, si no venció. Marca las vencidas de paso. */
export async function pendienteVigente(
  supabase: SupabaseClient,
  channel: Channel,
  externalId: string,
): Promise<PendingAction | null> {
  await supabase
    .from('pending_actions')
    .update({ status: 'expired' })
    .eq('channel', channel)
    .eq('external_id', externalId)
    .eq('status', 'pending')
    .lte('expires_at', new Date().toISOString());

  const { data, error } = await supabase
    .from('pending_actions').select('*')
    .eq('channel', channel).eq('external_id', externalId).eq('status', 'pending')
    .maybeSingle();
  if (error) fallar('No se pudo leer la acción pendiente', error);
  return data ? rowToPending(data) : null;
}

/** Crea una pendiente nueva, descartando cualquier otra viva de la conversación. */
export async function crearPendiente(
  supabase: SupabaseClient,
  userId: string,
  channel: Channel,
  externalId: string,
  kind: PendingKind,
  payload: PendingPayload,
  summary: string,
): Promise<PendingAction> {
  await supabase
    .from('pending_actions')
    .update({ status: 'cancelled' })
    .eq('channel', channel)
    .eq('external_id', externalId)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from('pending_actions')
    .insert({
      user_id: userId,
      channel,
      external_id: externalId,
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
