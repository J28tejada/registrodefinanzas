import { NextRequest, NextResponse } from 'next/server';
import { setNumberLedger, unlinkNumber } from '@/lib/whatsapp/db';

type RouteContext = { params: Promise<{ id: string }> };

/** Cambia a qué cuenta van los movimientos que llegan de ese número. */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  try {
    const body = await req.json();
    const ledgerId = typeof body?.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;
    await setNumberLedger(id, ledgerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const ok = await unlinkNumber(id);
  if (!ok) return NextResponse.json({ error: 'Ese número no estaba vinculado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
