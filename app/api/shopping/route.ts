import { NextRequest, NextResponse } from 'next/server';
import { createShoppingList, getLedgerRole, getShoppingLists } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/** Las listas: plantillas de lo que se suele comprar. */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const lists = await getShoppingLists(db, req.nextUrl.searchParams.get('ledger_id') || null);
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
      if (ledgerId && !(await getLedgerRole(db, ledgerId))) {
        return NextResponse.json({ error: 'No tenés acceso a esa cuenta.' }, { status: 403 });
      }

      return NextResponse.json(await createShoppingList(db, { name, ledger_id: ledgerId }), { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
