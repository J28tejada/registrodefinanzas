import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { deleteCard } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  let userId: string | null = null;
  try { ({ userId } = await auth()); } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 401 }); }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { id } = await params;
  const deleted = await deleteCard(userId, id);
  if (!deleted) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  return NextResponse.json({ success: true });
}
