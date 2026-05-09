import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllTransactions, createTransaction } from '@/lib/db';
import { TransactionFilters } from '@/lib/types';

export async function GET(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { searchParams } = req.nextUrl;
    const filters: TransactionFilters = {};
    const type = searchParams.get('type');
    const scope = searchParams.get('scope');
    const category = searchParams.get('category');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');

    if (type === 'income' || type === 'expense') filters.type = type;
    if (scope === 'personal' || scope === 'business') filters.scope = scope;
    if (category) filters.category = category;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (search) filters.search = search;

    const transactions = await getAllTransactions(userId, filters);
    return NextResponse.json(transactions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('transactions error:', msg);
    return NextResponse.json({ error: 'Error al obtener transacciones', detail: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const { type, scope, amount, category, description, date, source, paymentMethod, cardId, cardName } = body;

    if (!type || !scope || amount == null || !category || !description || !date) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    if (!['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (!['personal', 'business'].includes(scope)) {
      return NextResponse.json({ error: 'Ámbito inválido' }, { status: 400 });
    }

    const tx = await createTransaction(userId, {
      type, scope, amount: Number(amount), category, description, date,
      source: source ?? 'manual',
      paymentMethod: paymentMethod ?? undefined,
      cardId: cardId ?? undefined,
      cardName: cardName ?? undefined,
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al crear transacción' }, { status: 500 });
  }
}
