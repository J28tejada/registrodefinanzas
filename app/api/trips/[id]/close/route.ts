import { NextRequest, NextResponse } from 'next/server';
import { cerrarCompra } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

/** Cierra la compra y la convierte en el gasto del súper. */
export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const category = typeof b.category === 'string' ? b.category.trim() : '';
      if (!category) {
        return NextResponse.json({ error: 'Elegí en qué categoría anotar el gasto.' }, { status: 400 });
      }

      // Opcional: sin monto vale la suma de lo tildado.
      let amount: number | undefined;
      if (b.amount !== undefined && b.amount !== null && b.amount !== '') {
        amount = Number(b.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json({ error: 'El monto pagado tiene que ser mayor que cero.' }, { status: 400 });
        }
      }

      const res = await cerrarCompra(db, id, {
        category,
        amount,
        card_id: typeof b.card_id === 'string' && b.card_id ? b.card_id : null,
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ compra: res.compra, transaction: res.transaction });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
