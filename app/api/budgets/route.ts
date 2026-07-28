import { NextRequest, NextResponse } from 'next/server';
import { getBudgetProgress, getSettings, upsertBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Presupuestos con el gasto del mes pedido (por defecto, el mes en curso). */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    const mes = req.nextUrl.searchParams.get('month');
    const settings = await getSettings(db);
    const referencia = /^\d{4}-\d{2}$/.test(mes ?? '') ? `${mes}-01` : hoyEnZona(settings.timezone);
    const { start, end } = limitesDelMes(referencia);

    const budgets = await getBudgetProgress(db, start, end);
    return NextResponse.json({ month: start.slice(0, 7), start, end, budgets });
  });
}

/** Crea o actualiza el tope de una categoría. */
export async function POST(req: NextRequest) {
  return conSesion(async db => {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const amount = Number(body.amount);

    if (!category) {
      return NextResponse.json({ error: 'Falta la categoría.' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El monto tiene que ser un número mayor que cero.' }, { status: 400 });
    }

    const budget = await upsertBudget(db, category, amount);
    return NextResponse.json(budget, { status: 201 });
  });
}
