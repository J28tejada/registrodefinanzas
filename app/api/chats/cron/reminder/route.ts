import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions, getSettings } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllActiveLinks, logOutbound } from '@/lib/chat/db';
import { evolutionConfig, sendText } from '@/lib/chat/transports/evolution';
import { sendMessage, telegramToken } from '@/lib/chat/transports/telegram';
import { Channel } from '@/lib/chat/types';
import { hoyEnZona } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Recordatorio diario: "¿anotaste tus gastos de hoy?".
 * Solo escribe si el día quedó vacío — un recordatorio que llega igual cuando
 * ya anotaste se vuelve ruido y se ignora.
 *
 * Cada usuario tiene su zona horaria, así que "hoy" se calcula por usuario.
 * Con un solo disparo diario el aviso cae a distinta hora local según el país:
 * está bien para un recordatorio, no para algo que dependa de la hora exacta.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET` en sus crons.
 */
export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (secreto) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { enviados: 0, motivo: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }

  const links = await getAllActiveLinks(supabase);
  if (links.length === 0) {
    return NextResponse.json({ enviados: 0, motivo: 'No hay conversaciones vinculadas' });
  }

  const enviados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { channel: Channel; externalId: string; error: string }[] = [];

  for (const link of links) {
    const db = { supabase, userId: link.user_id };
    try {
      const settings = await getSettings(db);
      const hoy = hoyEnZona(settings.timezone);

      const delDia = await getAllTransactions(db, {
        ledger_id: link.ledger_id ?? undefined,
        startDate: hoy,
        endDate: hoy,
        limit: 1,
      });
      if (delDia.length > 0) {
        omitidos.push(link.external_id);
        continue;
      }

      const texto = '¿Anotaste tus gastos de hoy? Si querés, mandámelos por acá y los registro.';
      await logOutbound(supabase, link.user_id, link.channel, link.external_id, texto);
      await enviar(link.channel, link.external_id, texto);
      enviados.push(link.external_id);
    } catch (err) {
      fallidos.push({
        channel: link.channel,
        externalId: link.external_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // El detalle importa: un {enviados: 0} pelado esconde por qué.
  return NextResponse.json({
    enviados: enviados.length,
    omitidos: omitidos.length,
    motivoOmitidos: omitidos.length > 0 ? 'ya tenían movimientos hoy' : null,
    fallidos,
  });
}

async function enviar(channel: Channel, externalId: string, texto: string) {
  if (channel === 'telegram') {
    if (!telegramToken()) throw new Error('Telegram no está configurado (falta TELEGRAM_BOT_TOKEN)');
    await sendMessage(externalId, texto);
    return;
  }
  if (!evolutionConfig()) throw new Error('Evolution no está configurado');
  await sendText(externalId, texto);
}
