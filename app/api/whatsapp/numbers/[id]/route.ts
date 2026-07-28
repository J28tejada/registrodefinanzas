import { NextRequest, NextResponse } from 'next/server';
import { setNumberLedger, unlinkNumber } from '@/lib/whatsapp/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

/** Cambia a qué cuenta van los movimientos que llegan de ese número. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const body = await req.json();
      const ledgerId = typeof body?.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;
      await setNumberLedger(db.supabase, db.userId, id, ledgerId);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const ok = await unlinkNumber(db.supabase, db.userId, id);
    if (!ok) return NextResponse.json({ error: 'Ese número no estaba vinculado' }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
