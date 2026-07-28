import { NextRequest, NextResponse } from 'next/server';
import { setLinkLedger, unlink } from '@/lib/chat/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

/** Cambia a qué cuenta van los movimientos que llegan por esa conversación. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const body = await req.json();
      const ledgerId = typeof body?.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;
      await setLinkLedger(db.supabase, db.userId, id, ledgerId);
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
    const ok = await unlink(db.supabase, db.userId, id);
    if (!ok) return NextResponse.json({ error: 'Esa conversación no estaba vinculada' }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
