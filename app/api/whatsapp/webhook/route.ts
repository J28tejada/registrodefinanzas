import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { actualizarCuerpoMensaje, getLink, logInbound, logOutbound } from '@/lib/chat/db';
import { handleInboundMessage } from '@/lib/chat/handler';
import { leerImagen, transcribirAudio } from '@/lib/chat/media';
import { getBase64FromMediaMessage, sendText } from '@/lib/chat/transports/evolution';
import { MensajeEntrante } from '@/lib/chat/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Lectura del payload de Evolution ─────────────────────────────────────────

type Json = Record<string, unknown>;

/** Los mensajes efímeros y de "ver una vez" vienen envueltos en otra capa. */
function desenvolver(message: Json | undefined): Json | undefined {
  let actual = message;
  for (let i = 0; i < 4 && actual; i++) {
    const envoltorio =
      (actual.ephemeralMessage as Json | undefined) ??
      (actual.viewOnceMessage as Json | undefined) ??
      (actual.viewOnceMessageV2 as Json | undefined) ??
      (actual.viewOnceMessageV2Extension as Json | undefined) ??
      (actual.documentWithCaptionMessage as Json | undefined);
    if (!envoltorio?.message) return actual;
    actual = envoltorio.message as Json;
  }
  return actual;
}

function interpretarWebhook(data: Json): MensajeEntrante | null {
  const key = data.key as Json | undefined;
  const remoteJid = key?.remoteJid as string | undefined;
  if (!remoteJid) return null;

  // Solo el dueño de la plata: nada de grupos ni estados.
  if (remoteJid.endsWith('@g.us') || remoteJid.startsWith('status@')) return null;
  if (key?.fromMe === true) return null;

  const externalId = remoteJid.split('@')[0].split(':')[0];
  const providerMessageId = (key?.id as string) ?? null;
  const message = desenvolver(data.message as Json | undefined);
  if (!message) return null;

  const base = { channel: 'whatsapp' as const, externalId, providerMessageId };
  const extendido = message.extendedTextMessage as Json | undefined;
  const imagen = message.imageMessage as Json | undefined;
  const audio = message.audioMessage as Json | undefined;

  if (typeof message.conversation === 'string' && message.conversation.trim()) {
    return { ...base, tipo: 'texto', texto: message.conversation.trim(), descripcionTipo: 'texto' };
  }
  if (typeof extendido?.text === 'string' && extendido.text.trim()) {
    return { ...base, tipo: 'texto', texto: extendido.text.trim(), descripcionTipo: 'texto' };
  }
  if (audio) {
    return { ...base, tipo: 'audio', texto: '', descripcionTipo: 'nota de voz' };
  }
  if (imagen) {
    return {
      ...base,
      tipo: 'imagen',
      texto: typeof imagen.caption === 'string' ? imagen.caption : '',
      descripcionTipo: 'foto',
    };
  }

  const tipoCrudo = Object.keys(message).find(k => k.endsWith('Message')) ?? 'desconocido';
  return { ...base, tipo: 'no-soportado', texto: '', descripcionTipo: tipoCrudo };
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

function tokenValido(req: NextRequest): boolean {
  const esperado = process.env.EVOLUTION_WEBHOOK_TOKEN;
  if (!esperado) return false;
  const recibido =
    req.nextUrl.searchParams.get('token') ??
    req.headers.get('x-webhook-token') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';
  return recibido === esperado;
}

export async function POST(req: NextRequest) {
  if (!process.env.EVOLUTION_WEBHOOK_TOKEN) {
    // Sin token cualquiera puede postearle movimientos a las finanzas ajenas.
    return NextResponse.json(
      { error: 'EVOLUTION_WEBHOOK_TOKEN no está configurado: el webhook está cerrado.' },
      { status: 503 },
    );
  }
  if (!tokenValido(req)) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  let body: Json;
  try {
    body = await req.json();
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

  // Con webhookByEvents en false llega un solo objeto; `data` puede venir
  // suelto o en lista según la versión.
  const crudo = body.data ?? body;
  const eventos = (Array.isArray(crudo) ? crudo : [crudo]) as Json[];

  const resultados: string[] = [];
  for (const evento of eventos) {
    try {
      resultados.push(await procesar(supabase, evento));
    } catch (err) {
      console.error('[whatsapp] error procesando evento:', err);
      resultados.push('error');
    }
  }

  // Siempre 200: si devolvemos error, Evolution reintenta y el usuario recibe
  // la misma respuesta dos veces.
  return NextResponse.json({ ok: true, resultados });
}

async function procesar(supabase: SupabaseClient, data: Json): Promise<string> {
  const entrante = interpretarWebhook(data);
  if (!entrante) return 'ignorado';

  const { externalId, providerMessageId, tipo } = entrante;

  const link = await getLink(supabase, 'whatsapp', externalId);
  const userId = link?.user_id ?? null;

  // Marcar el mensaje antes de trabajar: si Evolution reintenta mientras
  // transcribimos, el segundo intento no duplica nada.
  const provisional = tipo === 'texto' ? entrante.texto : `[${entrante.descripcionTipo}]`;
  const mensajeId = await logInbound(supabase, userId, 'whatsapp', externalId, provisional, providerMessageId);
  if (!mensajeId) return 'duplicado';

  if (tipo === 'no-soportado') {
    await responder(supabase, userId, externalId, `Solo puedo leer texto, notas de voz y fotos. Eso que mandaste es "${entrante.descripcionTipo}" y no lo puedo interpretar.`);
    return 'no-soportado';
  }

  // Audio e imagen se convierten a texto y siguen el camino normal.
  let texto = entrante.texto;
  let eco: string | null = null;
  let receiptUrl: string | null = null;

  if (tipo === 'audio' || tipo === 'imagen') {
    // Una foto de alguien sin vincular no se guarda: no hay a quién atribuirla.
    if (tipo === 'imagen' && !userId) {
      await responder(supabase, null, externalId, 'Este número no está vinculado a ninguna cuenta, así que no puedo guardar recibos. Entrá a la app → WhatsApp y mandame el código de 6 letras.');
      return 'sin-vincular';
    }
    try {
      // Los medios viajan cifrados extremo a extremo: solo Evolution los descifra.
      const medio = await getBase64FromMediaMessage(data);
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
    channel: 'whatsapp',
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
  phone: string,
  texto: string,
) {
  await logOutbound(supabase, userId, 'whatsapp', phone, texto);
  try {
    await sendText(phone, texto);
  } catch (err) {
    console.error('[whatsapp] no se pudo enviar la respuesta:', err);
  }
}
