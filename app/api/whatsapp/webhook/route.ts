import { NextRequest, NextResponse } from 'next/server';
import { actualizarCuerpoMensaje, logInbound, logOutbound } from '@/lib/whatsapp/db';
import { handleInboundMessage } from '@/lib/whatsapp/handler';
import { leerImagen, transcribirAudio } from '@/lib/whatsapp/media';
import { sendText } from '@/lib/whatsapp/evolution';

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

interface Entrante {
  phone: string;
  waMessageId: string | null;
  tipo: 'texto' | 'audio' | 'imagen' | 'no-soportado';
  texto: string;
  descripcionTipo: string;
}

function interpretarWebhook(data: Json): Entrante | null {
  const key = data.key as Json | undefined;
  const remoteJid = key?.remoteJid as string | undefined;
  if (!remoteJid) return null;

  // Solo el dueño de la plata: nada de grupos ni estados (§9).
  if (remoteJid.endsWith('@g.us') || remoteJid.startsWith('status@')) return null;
  if (key?.fromMe === true) return null;

  const phone = remoteJid.split('@')[0].split(':')[0];
  const waMessageId = (key?.id as string) ?? null;
  const message = desenvolver(data.message as Json | undefined);
  if (!message) return null;

  const extendido = message.extendedTextMessage as Json | undefined;
  const imagen = message.imageMessage as Json | undefined;
  const audio = message.audioMessage as Json | undefined;

  if (typeof message.conversation === 'string' && message.conversation.trim()) {
    return { phone, waMessageId, tipo: 'texto', texto: message.conversation.trim(), descripcionTipo: 'texto' };
  }
  if (typeof extendido?.text === 'string' && extendido.text.trim()) {
    return { phone, waMessageId, tipo: 'texto', texto: extendido.text.trim(), descripcionTipo: 'texto' };
  }
  if (audio) {
    return { phone, waMessageId, tipo: 'audio', texto: '', descripcionTipo: 'nota de voz' };
  }
  if (imagen) {
    return {
      phone,
      waMessageId,
      tipo: 'imagen',
      texto: typeof imagen.caption === 'string' ? imagen.caption : '',
      descripcionTipo: 'foto',
    };
  }

  const tipoCrudo = Object.keys(message).find(k => k.endsWith('Message')) ?? 'desconocido';
  return { phone, waMessageId, tipo: 'no-soportado', texto: '', descripcionTipo: tipoCrudo };
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
    // Sin token cualquiera puede postearle movimientos a tus finanzas.
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

  // Con webhookByEvents en false llega un solo objeto; `data` puede venir
  // suelto o en lista según la versión.
  const crudo = body.data ?? body;
  const eventos = (Array.isArray(crudo) ? crudo : [crudo]) as Json[];

  const resultados: string[] = [];
  for (const evento of eventos) {
    try {
      resultados.push(await procesar(evento));
    } catch (err) {
      console.error('[whatsapp] error procesando evento:', err);
      resultados.push('error');
    }
  }

  // Siempre 200: si devolvemos error, Evolution reintenta y el usuario recibe
  // la misma respuesta dos veces.
  return NextResponse.json({ ok: true, resultados });
}

async function procesar(data: Json): Promise<string> {
  const entrante = interpretarWebhook(data);
  if (!entrante) return 'ignorado';

  const { phone, waMessageId, tipo } = entrante;

  // Marcar el mensaje antes de trabajar: si Evolution reintenta mientras
  // transcribimos, el segundo intento no duplica nada.
  const provisional = tipo === 'texto' ? entrante.texto : `[${entrante.descripcionTipo}]`;
  const mensajeId = await logInbound(phone, provisional, waMessageId);
  if (!mensajeId) return 'duplicado';

  if (tipo === 'no-soportado') {
    await responder(phone, `Solo puedo leer texto, notas de voz y fotos. Eso que mandaste es "${entrante.descripcionTipo}" y no lo puedo interpretar.`);
    return 'no-soportado';
  }

  // Audio e imagen se convierten a texto y siguen el camino normal (§5.8).
  let texto = entrante.texto;
  let eco: string | null = null;
  let receiptUrl: string | null = null;

  if (tipo === 'audio' || tipo === 'imagen') {
    try {
      const leido = tipo === 'audio'
        ? await transcribirAudio(data)
        : await leerImagen(data, phone, entrante.texto);
      texto = leido.texto;
      eco = leido.eco;
      receiptUrl = leido.receiptUrl;
      await actualizarCuerpoMensaje(mensajeId, texto);
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      const guardado = (err as { receiptUrl?: string }).receiptUrl;
      await responder(
        phone,
        `No pude leer tu ${entrante.descripcionTipo}. Motivo: ${detalle.slice(0, 200)}` +
        (guardado ? '\nLa foto quedó guardada igual, no se perdió.' : '') +
        '\n¿Me lo escribís?',
      );
      return 'medio-fallido';
    }
  }

  const respuesta = await handleInboundMessage({ phone, texto, eco, receiptUrl });
  await responder(phone, respuesta);
  return 'ok';
}

async function responder(phone: string, texto: string) {
  await logOutbound(phone, texto);
  try {
    await sendText(phone, texto);
  } catch (err) {
    console.error('[whatsapp] no se pudo enviar la respuesta:', err);
  }
}
