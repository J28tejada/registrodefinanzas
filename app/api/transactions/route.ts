import { NextRequest, NextResponse } from 'next/server';
import { getAllTransactions, createTransaction } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { TransactionFilters } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const { searchParams } = req.nextUrl;
      const filters: TransactionFilters = {};
      const ledger_id = searchParams.get('ledger_id');
      const type = searchParams.get('type');
      const scope = searchParams.get('scope');
      const category = searchParams.get('category');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const search = searchParams.get('search');
      const limit = Number(searchParams.get('limit'));

      if (ledger_id) filters.ledger_id = ledger_id;
      if (type === 'income' || type === 'expense') filters.type = type;
      if (scope === 'personal' || scope === 'business') filters.scope = scope;
      if (category) filters.category = category;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (search) filters.search = search;
      if (Number.isFinite(limit) && limit > 0) filters.limit = Math.min(limit, 500);

      const transactions = await getAllTransactions(db, filters);
      return NextResponse.json(transactions);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const body = await req.json();
      const { ledger_id, type, scope, amount, category, description, date, source, payment_method, card_id } = body;

      // La descripción no entra: muchos gastos no tienen nada que agregarle al
      // nombre de la categoría, y obligar a escribir algo termina en "Gasto".
      if (!type || !scope || amount == null || !category || !date) {
        return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
      }
      if (!['income', 'expense'].includes(type)) {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
      }
      if (!['personal', 'business'].includes(scope)) {
        return NextResponse.json({ error: 'Ámbito inválido' }, { status: 400 });
      }
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return NextResponse.json({ error: 'El monto tiene que ser mayor que cero' }, { status: 400 });
      }
      // Sin cuenta el movimiento no aparece en ninguna vista ni suma a ningún
      // saldo: queda huérfano. Se corta acá y no solo en el formulario.
      if (!ledger_id) {
        return NextResponse.json({ error: 'Elegí una cuenta para el movimiento' }, { status: 400 });
      }

      const tx = await createTransaction(db, {
        ledger_id: ledger_id ?? null,
        type,
        scope,
        amount: Number(amount),
        category,
        description: typeof description === 'string' ? description.trim() : '',
        date,
        source: source ?? 'manual',
        payment_method: payment_method ?? null,
        card_id: typeof card_id === 'string' && card_id ? card_id : null,
        receipt_url: null,
      });
      return NextResponse.json(tx, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
