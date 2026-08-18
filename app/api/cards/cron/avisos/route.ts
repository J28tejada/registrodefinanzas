import { NextRequest, NextResponse } from 'next/server';
import { getCardBalances, getCards, getSettings } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllActiveLinks, logOutbound } from '@/lib/chat/db';
import { evolutionConfig, sendText } from '@/lib/chat/transports/evolution';
import { sendMessage, telegramToken } from '@/lib/chat/transports/telegram';
import { Channel, ChatLink } from '@/lib/chat/types';
import { hoyEnZona, makeFormatters } from '@/lib/format';
import { AvisoDeTarjeta, avisosDeTarjetas, cuandoVence } from '@/lib/tarjetas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Aviso de que se viene el corte o el pago de una tarjeta de crédito.
 *
 * Avisa todos los días desde tres antes hasta el día mismo. Cada aviso se anota
 * en `card_alerts` ANTES de mandarlo, con la clave única haciendo de candado: si
 * el cron corre dos veces —un reintento, un deploy— el segundo no consigue
 * anotar y no manda nada. Si el envío falla se borra la anotación, para que el
 * día siguiente lo vuelva a intentar en vez de perderse.
 *
 * Va por usuario y no por conversación: alguien con Telegram y WhatsApp
 * vinculados tiene que recibir el aviso en los dos, no que el primero le tape el
 * segundo por el candado.
 *
 * Quien no tenga ningún chat vinculado no recibe nada por acá; para eso está el
 * cartel adentro de la app, que no depende de esto.
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

  // Una vuelta por usuario, no por conversación: el saldo se calcula una sola
  // vez y el candado del aviso queda a nivel del usuario.
  const porUsuario = new Map<string, ChatLink[]>();
  for (const link of links) {
    porUsuario.set(link.user_id, [...(porUsuario.get(link.user_id) ?? []), link]);
  }

  let enviados = 0;
  let sinAvisos = 0;
  let repetidos = 0;
  const fallidos: { userId: string; error: string }[] = [];

  for (const [userId, susLinks] of porUsuario) {
    const db = { supabase, userId };
    try {
      const settings = await getSettings(db);
      // "Hoy" en la zona del usuario: el cron corre en UTC y a las 12:00 UTC ya
      // es hoy en América, pero calcular los días contra UTC erraría por uno a
      // quien viva del otro lado.
      const hoy = hoyEnZona(settings.timezone);
      const fmt = makeFormatters(settings);

      const cards = await getCards(db);
      const saldos = await getCardBalances(db, cards, hoy);
      const avisos = avisosDeTarjetas(cards, saldos);
      if (avisos.length === 0) { sinAvisos++; continue; }

      for (const aviso of avisos) {
        const anotado = await anotarAviso(supabase, userId, aviso);
        if (!anotado) { repetidos++; continue; }

        const texto = redactar(aviso, fmt.money);
        try {
          for (const link of susLinks) {
            await logOutbound(supabase, userId, link.channel, link.external_id, texto);
            await enviar(link.channel, link.external_id, texto);
          }
          enviados++;
        } catch (err) {
          // Se borra la anotación para que el próximo intento lo reintente en
          // vez de darlo por mandado.
          await borrarAviso(supabase, userId, aviso);
          throw err;
        }
      }
    } catch (err) {
      fallidos.push({ userId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // El detalle importa: un {enviados: 0} pelado esconde por qué.
  return NextResponse.json({
    enviados,
    usuarios: porUsuario.size,
    sinAvisos,
    repetidos,
    fallidos,
  });
}

/**
 * Reserva el aviso. Devuelve false si ya estaba anotado.
 *
 * El candado es la clave única de `card_alerts`, no una consulta previa: entre
 * mirar y escribir puede meterse otra corrida del cron.
 */
async function anotarAviso(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  aviso: AvisoDeTarjeta,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('card_alerts')
    .upsert({
      card_id: aviso.card.id,
      user_id: userId,
      kind: aviso.kind,
      target_date: aviso.date,
      days_before: aviso.daysBefore,
    }, { onConflict: 'card_id,kind,target_date,days_before', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`No se pudo anotar el aviso: ${error.message}`);
  return (data ?? []).length > 0;
}

async function borrarAviso(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  aviso: AvisoDeTarjeta,
): Promise<void> {
  await supabase
    .from('card_alerts').delete()
    .eq('user_id', userId)
    .eq('card_id', aviso.card.id)
    .eq('kind', aviso.kind)
    .eq('target_date', aviso.date)
    .eq('days_before', aviso.daysBefore);
}

/** El texto del aviso. Dice el monto: sin número no se puede decidir nada. */
function redactar(aviso: AvisoDeTarjeta, money: (n: number) => string): string {
  const cuando = cuandoVence(aviso.daysBefore);
  const nombre = aviso.card.name;

  if (aviso.kind === 'due') {
    const cuanto = aviso.balance.aPagar > 0
      ? `Hay ${money(aviso.balance.aPagar)} por pagar.`
      : `Tu saldo es de ${money(Math.max(aviso.balance.saldo, 0))}.`;
    return aviso.daysBefore === 0
      ? `Hoy vence el pago de ${nombre}. ${cuanto}`
      : `Se viene el pago de ${nombre}: ${cuando}. ${cuanto}`;
  }

  const detalle = 'Lo que compres después ya entra en el estado de cuenta siguiente.';
  return aviso.daysBefore === 0
    ? `Hoy corta ${nombre}. ${detalle}`
    : `Se viene el corte de ${nombre}: ${cuando}. ${detalle}`;
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
