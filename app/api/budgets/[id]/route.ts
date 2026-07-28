import { NextRequest, NextResponse } from 'next/server';
import { deleteBudget } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const ok = await deleteBudget(db, id);
    if (!ok) return NextResponse.json({ error: 'Ese presupuesto no existe' }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
