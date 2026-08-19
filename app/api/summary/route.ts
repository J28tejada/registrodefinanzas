import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Sin `try` propio a propósito: `conSesion` ya traduce el fallo a JSON, y de
  // paso reintenta los desfasajes de reloj. Atajarlo acá los daba por perdidos
  // y le mostraba al usuario el mensaje crudo de Postgres.
  return conSesion(async db => {
    const { searchParams } = req.nextUrl;
    const summary = await getSummary(
      db,
      searchParams.get('ledger_id') ?? undefined,
      searchParams.get('startDate') ?? undefined,
      searchParams.get('endDate') ?? undefined,
    );
    return NextResponse.json(summary);
  });
}
