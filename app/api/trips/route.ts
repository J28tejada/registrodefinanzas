import { NextRequest, NextResponse } from 'next/server';
import { getSettings, getShoppingTrips, iniciarCompra } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { fechaValida, hoyEnZona } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** Las compras: lo que realmente pasó en el súper. */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const trips = await getShoppingTrips(db, {
        ledgerId: req.nextUrl.searchParams.get('ledger_id') || null,
        incluirCerradas: req.nextUrl.searchParams.get('cerradas') === '1',
      });
      return NextResponse.json({ trips });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

/** Arranca una compra, copiando una lista si se indica una. */
export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Ponele un nombre a la compra.' }, { status: 400 });

      const settings = await getSettings(db);
      const date = fechaValida(b.date, hoyEnZona(settings.timezone));

      const res = await iniciarCompra(db, {
        name,
        date,
        ledger_id: typeof b.ledger_id === 'string' && b.ledger_id ? b.ledger_id : null,
        list_id: typeof b.list_id === 'string' && b.list_id ? b.list_id : null,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json(res.compra, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
