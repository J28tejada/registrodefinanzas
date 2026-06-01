import { NextRequest, NextResponse } from 'next/server';
import { getAllLedgersWithStats, createLedger } from '@/lib/db';
import { LedgerColor, TransactionScope } from '@/lib/types';

const VALID_COLORS: LedgerColor[] = ['green', 'blue', 'purple', 'orange', 'red', 'teal', 'indigo', 'pink'];
const VALID_TYPES: TransactionScope[] = ['personal', 'business'];

export async function GET() {
  try {
    const ledgers = await getAllLedgersWithStats();
    return NextResponse.json(ledgers);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al obtener cuentas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, color, type, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }
    if (!VALID_COLORS.includes(color)) {
      return NextResponse.json({ error: 'Color inválido' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }

    const ledger = await createLedger({
      name: name.trim(),
      color,
      type,
      description: description ?? '',
    });
    return NextResponse.json(ledger, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al crear cuenta' }, { status: 500 });
  }
}
