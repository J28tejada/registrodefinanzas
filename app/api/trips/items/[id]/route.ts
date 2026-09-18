import { NextRequest, NextResponse } from 'next/server';
import { deleteTripItem, updateTripItem } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerCambiosDeArticulo } from '@/lib/compras-campos';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const leido = leerCambiosDeArticulo(
        await req.json().catch(() => ({})), { conTilde: true },
      );
      if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

      const item = await updateTripItem(db, id, leido.datos);
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
      const borrado = await deleteTripItem(db, id);
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
