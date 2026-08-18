import { NextResponse } from 'next/server';
import { getCardBalances, getCards, getSettings } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona } from '@/lib/format';
import { avisosDeTarjetas } from '@/lib/tarjetas';

export const dynamic = 'force-dynamic';

/**
 * Los cortes y pagos que se vienen en los próximos días.
 *
 * Aparte de `/api/cards` porque el tablero solo necesita esto y no el gasto por
 * tarjeta del mes, que son tres consultas más para tirar a la basura.
 *
 * Es el respaldo del aviso por chat: quien no tenga la conversación vinculada
 * no recibe el mensaje, pero abre la app y lo ve igual.
 */
export async function GET() {
  return conSesion(async db => {
    try {
      const settings = await getSettings(db);
      const hoy = hoyEnZona(settings.timezone);

      const cards = await getCards(db);
      const saldos = await getCardBalances(db, cards, hoy);

      return NextResponse.json({ avisos: avisosDeTarjetas(cards, saldos) });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
