import { NextRequest, NextResponse } from 'next/server';
import { deleteShoppingItem, updateShoppingItem } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { ShoppingItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const cambios: Partial<Omit<ShoppingItem, 'id' | 'list_id' | 'created_at'>> = {};

      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });
        cambios.name = name;
      }
      if (b.category !== undefined) cambios.category = String(b.category).trim() || 'Otros';
      if (b.unit !== undefined) cambios.unit = String(b.unit).trim() || 'unidad';
      if (b.checked !== undefined) cambios.checked = Boolean(b.checked);

      if (b.quantity !== undefined) {
        const n = Number(b.quantity);
        if (!Number.isFinite(n) || n <= 0) {
          return NextResponse.json({ error: 'La cantidad tiene que ser mayor que cero.' }, { status: 400 });
        }
        cambios.quantity = n;
      }
      if (b.unit_price !== undefined) {
        const n = Number(b.unit_price);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: 'El precio no puede ser negativo.' }, { status: 400 });
        }
        cambios.unit_price = n;
      }

      if (Object.keys(cambios).length === 0) {
        return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });
      }

      const item = await updateShoppingItem(db, id, cambios);
      if (!item) return NextResponse.json({ error: 'Ese artículo no existe.' }, { status: 404 });
      return NextResponse.json(item);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const borrado = await deleteShoppingItem(db, id);
      if (!borrado) return NextResponse.json({ error: 'Ese artículo no existe.' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
