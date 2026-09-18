import { NextRequest, NextResponse } from 'next/server';
import { getAllLedgersWithStats, createLedger } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerCuentaNueva } from '@/lib/cuentas-campos';

export const dynamic = 'force-dynamic';

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
      const leido = leerCuentaNueva(await req.json());
      if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

      const ledger = await createLedger(db, leido.campos);
      return NextResponse.json(ledger, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
