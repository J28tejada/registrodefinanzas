import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions } from '@/lib/db';
import { getAllNumbers, logOutbound } from '@/lib/whatsapp/db';
import { sendText, evolutionConfig } from '@/lib/whatsapp/evolution';
import { hoyLocal } from '@/lib/whatsapp/config';

export const dynamic = 'force-dynamic';

/**
 * Recordatorio diario: "¿anotaste tus gastos de hoy?".
 * Solo escribe si el día quedó vacío — un recordatorio que llega igual cuando
 * ya anotaste se vuelve ruido y se ignora.
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

  const numeros = (await getAllNumbers()).filter(n => n.active);
  if (numeros.length === 0) {
    return NextResponse.json({ enviados: 0, motivo: 'No hay números vinculados' });
  }

  const hoy = hoyLocal();
  const enviados: string[] = [];
  const omitidos: string[] = [];
  const fallidos: { phone: string; error: string }[] = [];

  for (const numero of numeros) {
    const delDia = await getAllTransactions({
      ledger_id: numero.ledger_id ?? undefined,
      startDate: hoy,
      endDate: hoy,
    });
    if (delDia.length > 0) {
      omitidos.push(numero.phone);
      continue;
    }

    const texto = '¿Anotaste tus gastos de hoy? Si querés, mandámelos por acá y los registro.';
    try {
      await logOutbound(numero.phone, texto);
      await sendText(numero.phone, texto);
      enviados.push(numero.phone);
    } catch (err) {
      fallidos.push({ phone: numero.phone, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // El detalle importa: un {enviados: 0} pelado esconde por qué (§5.6).
  return NextResponse.json({
    fecha: hoy,
    enviados: enviados.length,
    omitidos: omitidos.length,
    motivoOmitidos: omitidos.length > 0 ? 'ya tenían movimientos hoy' : null,
    fallidos,
  });
}
