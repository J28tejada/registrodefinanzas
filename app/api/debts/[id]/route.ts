import { NextRequest, NextResponse } from 'next/server';
import { deleteDebt, updateDebt } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json();
      const cambios: Record<string, unknown> = {};

      if (b.name !== undefined) {
        if (typeof b.name !== 'string' || !b.name.trim()) {
          return NextResponse.json({ error: 'Nombre inválido' }, { status: 400 });
        }
        cambios.name = b.name.trim();
      }
      for (const [campo, valor] of [
        ['total_amount', b.total_amount],
        ['installment_amount', b.installment_amount],
      ] as const) {
        if (valor !== undefined) {
          const n = Number(valor);
          if (!Number.isFinite(n) || n <= 0) {
            return NextResponse.json({ error: `${campo} tiene que ser mayor que cero` }, { status: 400 });
          }
          cambios[campo] = n;
        }
      }
      if (b.installments !== undefined) {
        const n = Number(b.installments);
        if (!Number.isInteger(n) || n <= 0) {
          return NextResponse.json({ error: 'Cantidad de cuotas inválida' }, { status: 400 });
        }
        cambios.installments = n;
      }
      if (b.creditor !== undefined) cambios.creditor = String(b.creditor).trim();
      if (b.notes !== undefined) cambios.notes = String(b.notes).trim();
      if (b.category !== undefined) cambios.category = String(b.category).trim();
      if (b.ledger_id !== undefined) cambios.ledger_id = b.ledger_id || null;
      if (b.archived !== undefined) cambios.archived = Boolean(b.archived);
      if (b.start_date !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.start_date))) {
          return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
        }
        cambios.start_date = b.start_date;
      }

      const deuda = await updateDebt(db, id, cambios);
      if (!deuda) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
      return NextResponse.json(deuda);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const borrada = await deleteDebt(db, id);
      if (!borrada) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
