import { NextRequest, NextResponse } from 'next/server';
import { getLedgerById, updateLedger, deleteLedger } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { LedgerColor, TransactionScope } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

const VALID_COLORS: LedgerColor[] = ['green', 'blue', 'purple', 'orange', 'red', 'teal', 'indigo', 'pink'];
const VALID_TYPES: TransactionScope[] = ['personal', 'business'];

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const ledger = await getLedgerById(db, id);
      if (!ledger) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
      return NextResponse.json(ledger);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
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

      const ledger = await updateLedger(db, id, updates);
      if (!ledger) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
      return NextResponse.json(ledger);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const result = await deleteLedger(db, id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
