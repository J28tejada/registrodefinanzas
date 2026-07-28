import { NextRequest, NextResponse } from 'next/server';
import { getTransactionById, updateTransaction, deleteTransaction } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    const tx = await getTransactionById(db, id);
    if (!tx) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json(tx);
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const body = await req.json();
      const tx = await updateTransaction(db, id, body);
      if (!tx) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
      return NextResponse.json(tx);
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
    const deleted = await deleteTransaction(db, id);
    if (!deleted) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  });
}
