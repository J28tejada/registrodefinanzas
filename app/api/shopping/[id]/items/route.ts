import { NextRequest, NextResponse } from 'next/server';
import { addShoppingItem } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));

      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Ponele un nombre al artículo.' }, { status: 400 });

      // La cantidad por defecto es 1 y el precio 0: en el súper mucha gente
      // arma la lista primero y recién en la góndola pone el precio.
      const quantity = b.quantity === undefined || b.quantity === '' ? 1 : Number(b.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: 'La cantidad tiene que ser mayor que cero.' }, { status: 400 });
      }
      const unitPrice = b.unit_price === undefined || b.unit_price === '' ? 0 : Number(b.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: 'El precio no puede ser negativo.' }, { status: 400 });
      }

      const item = await addShoppingItem(db, id, {
        name,
        category: typeof b.category === 'string' && b.category.trim() ? b.category.trim() : 'Otros',
        quantity,
        unit: typeof b.unit === 'string' && b.unit.trim() ? b.unit.trim() : 'unidad',
        unit_price: unitPrice,
      });
      return NextResponse.json(item, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
