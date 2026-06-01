import { NextRequest, NextResponse } from 'next/server';
import { getLedgerById, updateLedger, deleteLedger } from '@/lib/db';
import { LedgerColor, TransactionScope } from '@/lib/types';

const VALID_COLORS: LedgerColor[] = ['green', 'blue', 'purple', 'orange', 'red', 'teal', 'indigo', 'pink'];
const VALID_TYPES: TransactionScope[] = ['personal', 'business'];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ledger = await getLedgerById(id);
    if (!ledger) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    return NextResponse.json(ledger);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al obtener cuenta' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
      }
      updates.name = body.name.trim();
    }
    if (body.color !== undefined) {
      if (!VALID_COLORS.includes(body.color as LedgerColor)) {
        return NextResponse.json({ error: 'Color inválido' }, { status: 400 });
      }
      updates.color = body.color as LedgerColor;
    }
    if (body.type !== undefined) {
      if (!VALID_TYPES.includes(body.type as TransactionScope)) {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
      }
      updates.type = body.type as TransactionScope;
    }
    if (body.description !== undefined) updates.description = body.description;

    const ledger = await updateLedger(id, updates);
    if (!ledger) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    return NextResponse.json(ledger);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al actualizar cuenta' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await deleteLedger(id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al eliminar cuenta' }, { status: 500 });
  }
}
