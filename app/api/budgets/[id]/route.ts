import { NextRequest, NextResponse } from 'next/server';
import { deleteBudget, updateBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Editar un tope: el monto, la cuenta a la que pertenece, o los dos.
 *
 * Los campos ausentes se dejan como están, así que mover un presupuesto no
 * arrastra el monto y viceversa.
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const body = await req.json().catch(() => ({}));
    const cambios: { amount?: number; ledger_id?: string | null } = {};

    if ('amount' in body) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'El monto tiene que ser mayor que cero.' }, { status: 400 });
      }
      cambios.amount = amount;
    }
    if ('ledger_id' in body) {
      cambios.ledger_id = typeof body.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;
    }
    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });
    }

    const res = await updateBudget(db, id, cambios);
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
