import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { actualizarCuerpoMensaje, getLink, logInbound, logOutbound } from '@/lib/chat/db';
import { handleInboundMessage } from '@/lib/chat/handler';
import { leerImagen, transcribirAudio } from '@/lib/chat/media';
import {
  descargarArchivo,
  interpretarUpdate,
  sendMessage,
  sendTyping,
} from '@/lib/chat/transports/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Json = Record<string, unknown>;

export async function POST(req: NextRequest) {
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secreto) {
    // Sin secreto cualquiera puede postearle movimientos a las finanzas ajenas.
    return NextResponse.json(
      { error: 'TELEGRAM_WEBHOOK_SECRET no está configurado: el webhook está cerrado.' },
      { status: 503 },
    );
  }
  if (req.headers.get('x-telegram-bot-api-secret-token') !== secreto) {
    return NextResponse.json({ error: 'Secreto inválido' }, { status: 401 });
  }

  let update: Json;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  let resultado = 'ignorado';
  try {
    resultado = await procesar(supabase, update);
  } catch (err) {
    console.error('[telegram] error procesando update:', err);
    resultado = 'error';
  }

  // Siempre 200: si devolvemos error, Telegram reintenta y el usuario recibe la
  // misma respuesta dos veces.
  return NextResponse.json({ ok: true, resultado });
}

async function procesar(supabase: SupabaseClient, update: Json): Promise<string> {
  const entrante = interpretarUpdate(update);
  if (!entrante) return 'ignorado';

  const { externalId, providerMessageId, tipo } = entrante;

  const link = await getLink(supabase, 'telegram', externalId);
  const userId = link?.user_id ?? null;

  // Marcar el mensaje antes de trabajar: si Telegram reintenta mientras
  // transcribimos, el segundo intento no duplica nada.
  const provisional = tipo === 'texto' ? entrante.texto : `[${entrante.descripcionTipo}]`;
  const mensajeId = await logInbound(supabase, userId, 'telegram', externalId, provisional, providerMessageId);
  if (!mensajeId) return 'duplicado';

  if (tipo === 'no-soportado') {
    await responder(supabase, userId, externalId, `Solo puedo leer texto, notas de voz y fotos. Eso que mandaste es "${entrante.descripcionTipo}" y no lo puedo interpretar.`);
    return 'no-soportado';
  }

  await sendTyping(externalId);

  // Audio e imagen se convierten a texto y siguen el camino normal.
  let texto = entrante.texto;
  let eco: string | null = null;
  let receiptUrl: string | null = null;

  if (tipo === 'audio' || tipo === 'imagen') {
    // Una foto de alguien sin vincular no se guarda: no hay a quién atribuirla.
    if (tipo === 'imagen' && !userId) {
      await responder(supabase, null, externalId, 'Esta conversación no está vinculada a ninguna cuenta, así que no puedo guardar recibos. Entrá a la app → Telegram y mandame el código de 6 letras.');
      return 'sin-vincular';
    }
    try {
      const medio = await descargarArchivo(entrante.fileId!, entrante.mimeType);
      const leido = tipo === 'audio'
        ? await transcribirAudio(medio)
        : await leerImagen(supabase, userId!, medio, entrante.texto);
      texto = leido.texto;
      eco = leido.eco;
      receiptUrl = leido.receiptUrl;
      await actualizarCuerpoMensaje(supabase, mensajeId, texto);
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      const guardado = (err as { receiptUrl?: string }).receiptUrl;
      await responder(
        supabase,
        userId,
        externalId,
        `No pude leer tu ${entrante.descripcionTipo}. Motivo: ${detalle.slice(0, 200)}` +
        (guardado ? '\nLa foto quedó guardada igual, no se perdió.' : '') +
        '\n¿Me lo escribís?',
      );
      return 'medio-fallido';
    }
  }

  const respuesta = await handleInboundMessage({
    supabase,
    channel: 'telegram',
    externalId,
    texto,
    eco,
    receiptUrl,
  });
  await responder(supabase, userId, externalId, respuesta);
  return 'ok';
}

async function responder(
  supabase: SupabaseClient,
  userId: string | null,
  chatId: string,
  texto: string,
) {
  await logOutbound(supabase, userId, 'telegram', chatId, texto);
  try {
    await sendMessage(chatId, texto);
  } catch (err) {
    console.error('[telegram] no se pudo enviar la respuesta:', err);
  }
}
