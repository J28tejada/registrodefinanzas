import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getCards, createCard } from '@/lib/db';

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try { ({ userId } = await auth()); } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 401 }); }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const cards = await getCards(userId, startDate, endDate);
    return NextResponse.json(cards);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Error al obtener tarjetas', detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try { ({ userId } = await auth()); } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 401 }); }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const { name, type } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });
    if (!['credit', 'debit'].includes(type)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    const card = await createCard(userId, { name, type });
    return NextResponse.json(card, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'Error al crear tarjeta', detail: msg }, { status: 500 });
  }
}
