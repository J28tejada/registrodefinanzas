import { NextRequest, NextResponse } from 'next/server';
import { getLedgerById, updateLedger, deleteLedger } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerCambiosDeCuenta } from '@/lib/cuentas-campos';

type RouteContext = { params: Promise<{ id: string }> };

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
      const leido = leerCambiosDeCuenta(await req.json());
      if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

      const ledger = await updateLedger(db, id, leido.campos);
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
