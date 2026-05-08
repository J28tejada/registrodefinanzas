import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTransactionById, updateTransaction, deleteTransaction } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const tx = await getTransactionById(userId, id);
  if (!tx) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json(tx);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const tx = await updateTransaction(userId, id, body);
    if (!tx) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json(tx);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const deleted = await deleteTransaction(userId, id);
  if (!deleted) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ success: true });
}
