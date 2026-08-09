import { NextRequest, NextResponse } from 'next/server';
import { getBudgetProgress, getLedgerRole, getSettings, upsertBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * Presupuestos con el gasto del mes pedido (por defecto, el mes en curso).
 *
 * `ledger_id` limita a los topes de esa cuenta. Sin él vienen todos: es la
 * vista de "Todas las cuentas", donde cada uno se muestra con su etiqueta.
 */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    const mes = req.nextUrl.searchParams.get('month');
    const settings = await getSettings(db);
    const referencia = /^\d{4}-\d{2}$/.test(mes ?? '') ? `${mes}-01` : hoyEnZona(settings.timezone);
    const { start, end } = limitesDelMes(referencia);

    const cuenta = req.nextUrl.searchParams.get('ledger_id');
    // "sin_cuenta" es explícito a propósito: la ausencia del parámetro ya
    // significa "todas", así que hace falta otra palabra para "las globales".
    const filtro = cuenta === 'sin_cuenta' ? null : cuenta || undefined;

    const budgets = await getBudgetProgress(db, start, end, filtro);
    return NextResponse.json({ month: start.slice(0, 7), start, end, budgets });
  });
}

/** Crea o actualiza el tope de una categoría en una cuenta. */
export async function POST(req: NextRequest) {
  return conSesion(async db => {
    const body = await req.json().catch(() => ({}));
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const amount = Number(body.amount);
    const ledgerId = typeof body.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;

    if (!category) {
      return NextResponse.json({ error: 'Falta la categoría.' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El monto tiene que ser un número mayor que cero.' }, { status: 400 });
    }
    // El service role del webhook no pasa por RLS: la pertenencia se verifica acá.
    if (ledgerId && !(await getLedgerRole(db, ledgerId))) {
      return NextResponse.json({ error: 'No tenés acceso a esa cuenta.' }, { status: 403 });
    }

    const budget = await upsertBudget(db, category, amount, ledgerId);
    return NextResponse.json(budget, { status: 201 });
  });
}
