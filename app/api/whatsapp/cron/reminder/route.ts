import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions, getSettings } from '@/lib/db';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAllActiveNumbers, logOutbound } from '@/lib/whatsapp/db';
import { sendText, evolutionConfig } from '@/lib/whatsapp/evolution';
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

  if (!evolutionConfig()) {
    return NextResponse.json({ enviados: 0, motivo: 'Evolution no está configurado' });
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

  const numeros = await getAllActiveNumbers(supabase);
  if (numeros.length === 0) {
    return NextResponse.json({ enviados: 0, motivo: 'No hay números vinculados' });
  }

  const enviados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { phone: string; error: string }[] = [];

  for (const numero of numeros) {
    const db = { supabase, userId: numero.user_id };
    try {
      const settings = await getSettings(db);
      const hoy = hoyEnZona(settings.timezone);

      const delDia = await getAllTransactions(db, {
        ledger_id: numero.ledger_id ?? undefined,
        startDate: hoy,
        endDate: hoy,
        limit: 1,
      });
      if (delDia.length > 0) {
        omitidos.push(numero.phone);
        continue;
      }

      const texto = '¿Anotaste tus gastos de hoy? Si querés, mandámelos por acá y los registro.';
      await logOutbound(supabase, numero.user_id, numero.phone, texto);
      await sendText(numero.phone, texto);
      enviados.push(numero.phone);
    } catch (err) {
      fallidos.push({ phone: numero.phone, error: err instanceof Error ? err.message : String(err) });
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
