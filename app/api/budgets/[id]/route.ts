import { NextRequest, NextResponse } from 'next/server';
import { deleteBudget, moverBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

/** Mover un tope a otra cuenta, o dejarlo global con `ledger_id: null`. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const body = await req.json().catch(() => ({}));
    if (!('ledger_id' in body)) {
      return NextResponse.json({ error: 'Falta ledger_id.' }, { status: 400 });
    }
    const ledgerId = typeof body.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;

    const res = await moverBudget(db, id, ledgerId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res.budget);
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const ok = await deleteBudget(db, id);
    if (!ok) return NextResponse.json({ error: 'Ese presupuesto no existe' }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
