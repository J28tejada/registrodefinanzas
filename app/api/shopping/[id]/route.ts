import { NextRequest, NextResponse } from 'next/server';
import { deleteShoppingList, getShoppingList, updateShoppingList } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const lista = await getShoppingList(db, id);
      if (!lista) return NextResponse.json({ error: 'Esa lista no existe.' }, { status: 404 });
      return NextResponse.json(lista);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const cambios: { name?: string; date?: string; ledger_id?: string | null } = {};

      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });
        cambios.name = name;
      }
      if (b.date !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) {
          return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
        }
        cambios.date = b.date;
      }
      if (b.ledger_id !== undefined) cambios.ledger_id = b.ledger_id || null;

      const lista = await updateShoppingList(db, id, cambios);
      if (!lista) return NextResponse.json({ error: 'Esa lista no existe.' }, { status: 404 });
      return NextResponse.json(lista);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const borrada = await deleteShoppingList(db, id);
      if (!borrada) return NextResponse.json({ error: 'Esa lista no existe.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
