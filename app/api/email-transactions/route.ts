import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPendingEmailTransactions } from '@/lib/db';

export async function GET() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const transactions = await getPendingEmailTransactions(userId);
    return NextResponse.json(transactions);
  } catch (err) {
    console.error('Email transactions fetch error:', err);
    return NextResponse.json({ error: 'Error al obtener transacciones' }, { status: 500 });
  }
}
