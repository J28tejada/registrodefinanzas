import { NextRequest, NextResponse } from 'next/server';
import { createDebt, getDebtsProgress, getSettings, upsertBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes } from '@/lib/format';

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

      const total = Number(b.total_amount);
      const cuota = Number(b.installment_amount);
      const cuotas = Number(b.installments);

      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'Ponele un nombre a la deuda' }, { status: 400 });
      }
      if (!Number.isFinite(total) || total <= 0) {
        return NextResponse.json({ error: 'El total tiene que ser mayor que cero' }, { status: 400 });
      }
      if (!Number.isFinite(cuota) || cuota <= 0) {
        return NextResponse.json({ error: 'La cuota tiene que ser mayor que cero' }, { status: 400 });
      }
      if (!Number.isInteger(cuotas) || cuotas <= 0) {
        return NextResponse.json({ error: 'La cantidad de cuotas tiene que ser un número entero' }, { status: 400 });
      }
      if (typeof b.category !== 'string' || !b.category.trim()) {
        return NextResponse.json({ error: 'Elegí una categoría para los pagos' }, { status: 400 });
      }
      if (typeof b.start_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.start_date)) {
        return NextResponse.json({ error: 'Fecha de la primera cuota inválida' }, { status: 400 });
      }

      const deuda = await createDebt(db, {
        ledger_id: typeof b.ledger_id === 'string' && b.ledger_id ? b.ledger_id : null,
        name: b.name.trim(),
        creditor: typeof b.creditor === 'string' ? b.creditor.trim() : '',
        total_amount: total,
        installment_amount: cuota,
        installments: cuotas,
        start_date: b.start_date,
        category: b.category.trim(),
        notes: typeof b.notes === 'string' ? b.notes.trim() : '',
      });

      // "Ponerla en el presupuesto" es exactamente esto: un tope mensual en su
      // categoría por el monto de la cuota. Después el pago cae ahí solo.
      // En la misma cuenta donde se paga, o el tope quedaría en otro lado que
      // el gasto que va a generar.
      if (b.en_presupuesto === true) {
        await upsertBudget(db, deuda.category, cuota, deuda.ledger_id);
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
