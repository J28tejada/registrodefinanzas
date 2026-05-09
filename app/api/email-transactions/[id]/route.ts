import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  getEmailTransactionById,
  updateEmailTransactionStatus,
  createTransaction,
} from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json() as {
      action: 'confirm' | 'reject';
      type?: 'income' | 'expense';
      scope?: 'personal' | 'business';
      amount?: number;
      category?: string;
      description?: string;
      date?: string;
    };

    if (!body.action || !['confirm', 'reject'].includes(body.action)) {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    const emailTx = await getEmailTransactionById(userId, id);
    if (!emailTx) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    if (body.action === 'confirm') {
      await createTransaction(userId, {
        type: body.type ?? emailTx.type,
        scope: body.scope ?? emailTx.scope,
        amount: body.amount ?? emailTx.amount,
        category: body.category ?? emailTx.category,
        description: body.description ?? emailTx.description,
        date: body.date ?? emailTx.date,
        source: 'email',
      });
    }

    const updated = await updateEmailTransactionStatus(userId, id, body.action === 'confirm' ? 'confirmed' : 'rejected');
    return NextResponse.json(updated);
  } catch (err) {
    console.error('Email transaction update error:', err);
    return NextResponse.json({ error: 'Error al actualizar transacción' }, { status: 500 });
  }
}
