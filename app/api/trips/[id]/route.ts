import { NextRequest, NextResponse } from 'next/server';
import { deleteShoppingTrip, getShoppingTrip } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const compra = await getShoppingTrip(db, id);
      if (!compra) return NextResponse.json({ error: 'Esa compra no existe.' }, { status: 404 });
      return NextResponse.json(compra);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const borrada = await deleteShoppingTrip(db, id);
      if (!borrada) return NextResponse.json({ error: 'Esa compra no existe.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
