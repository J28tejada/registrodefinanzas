import { NextRequest, NextResponse } from 'next/server';
import { createDebt, getDebtsProgress, getSettings, upsertBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes } from '@/lib/format';
import { leerDeudaNueva } from '@/lib/deudas-campos';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      // El progreso del mes depende de qué mes se mire: el dashboard pregunta
      // por el actual, pero la pantalla de deudas navega hacia atrás.
      const mes = req.nextUrl.searchParams.get('month');
      const settings = await getSettings(db);
      // La zona del usuario, no la del servidor: en UTC un pago del 31 a la
      // noche caería en el mes siguiente.
      const referencia = /^\d{4}-\d{2}$/.test(mes ?? '') ? `${mes}-01` : hoyEnZona(settings.timezone);
      const { start, end } = limitesDelMes(referencia);
      const incluirArchivadas = req.nextUrl.searchParams.get('archivadas') === '1';

      const debts = await getDebtsProgress(db, start, end, { incluirArchivadas });
      return NextResponse.json({ month: start.slice(0, 7), start, end, debts });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const b = await req.json();

      const leido = leerDeudaNueva(b);
      if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

      const deuda = await createDebt(db, leido.datos);

      // "Ponerla en el presupuesto" es exactamente esto: un tope mensual en su
      // categoría por el monto de la cuota. Después el pago cae ahí solo.
      // En la misma cuenta donde se paga, o el tope quedaría en otro lado que
      // el gasto que va a generar.
      if (b.en_presupuesto === true) {
        await upsertBudget(db, deuda.category, deuda.installment_amount, deuda.ledger_id);
      }

      return NextResponse.json(deuda, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
