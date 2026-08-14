import { NextRequest, NextResponse } from 'next/server';
import { cerrarShoppingList } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/** Cierra la lista y la convierte en el gasto del súper. */
export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const category = typeof b.category === 'string' ? b.category.trim() : '';
      if (!category) {
        return NextResponse.json({ error: 'Elegí en qué categoría anotar el gasto.' }, { status: 400 });
      }

      const res = await cerrarShoppingList(db, id, {
        category,
        card_id: typeof b.card_id === 'string' && b.card_id ? b.card_id : null,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ lista: res.lista, transaction: res.transaction });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
