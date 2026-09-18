import { NextRequest, NextResponse } from 'next/server';
import { addTripItem } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerArticuloNuevo } from '@/lib/compras-campos';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const leido = leerArticuloNuevo(await req.json().catch(() => ({})));
      if (!leido.ok) return NextResponse.json({ error: leido.error }, { status: 400 });

      const item = await addTripItem(db, id, leido.datos);
      return NextResponse.json(item, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
