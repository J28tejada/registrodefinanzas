import { NextRequest, NextResponse } from 'next/server';
import { createShoppingList, getLedgerRole, getSettings, getShoppingLists } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { fechaValida, hoyEnZona } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const lists = await getShoppingLists(db, {
        ledgerId: req.nextUrl.searchParams.get('ledger_id') || null,
        incluirCerradas: req.nextUrl.searchParams.get('cerradas') === '1',
      });
      return NextResponse.json({ lists });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Ponele un nombre a la lista.' }, { status: 400 });

      const ledgerId = typeof b.ledger_id === 'string' && b.ledger_id ? b.ledger_id : null;
      // El service role no pasa por RLS: la pertenencia se verifica acá.
      if (ledgerId && !(await getLedgerRole(db, ledgerId))) {
        return NextResponse.json({ error: 'No tenés acceso a esa cuenta.' }, { status: 403 });
      }

      const settings = await getSettings(db);
      const date = fechaValida(b.date, hoyEnZona(settings.timezone));

      return NextResponse.json(await createShoppingList(db, { name, date, ledger_id: ledgerId }), { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
