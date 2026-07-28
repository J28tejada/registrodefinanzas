import { NextRequest, NextResponse } from 'next/server';
import { getAllLedgersWithStats, createLedger } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { LedgerColor, TransactionScope } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VALID_COLORS: LedgerColor[] = ['green', 'blue', 'purple', 'orange', 'red', 'teal', 'indigo', 'pink'];
const VALID_TYPES: TransactionScope[] = ['personal', 'business'];

export async function GET() {
  return conSesion(async db => {
    try {
      const ledgers = await getAllLedgersWithStats(db);
      return NextResponse.json(ledgers);
    } catch (err) {
      // El motivo real, no un "error al obtener cuentas" que no dice nada.
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const { name, color, type, description } = await req.json();

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      }
      if (!VALID_COLORS.includes(color)) {
        return NextResponse.json({ error: 'Color inválido' }, { status: 400 });
      }
      if (!VALID_TYPES.includes(type)) {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
      }

      const ledger = await createLedger(db, {
        name: name.trim(),
        color,
        type,
        description: description ?? '',
      });
      return NextResponse.json(ledger, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
