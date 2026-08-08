import { NextRequest, NextResponse } from 'next/server';
import { deleteCategory, renameCategory } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type Contexto = { params: Promise<{ id: string }> };

/** Renombrar arrastra los movimientos y presupuestos que la usaban. */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const { name } = await req.json();
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      }

      const resultado = await renameCategory(db, id, name);
      if ('error' in resultado) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json(resultado);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const resultado = await deleteCategory(db, id);
      // "La usan 5 movimientos" es una respuesta esperable, no un error del
      // sistema: el 400 deja que la pantalla la muestre tal cual.
      if (!resultado.ok) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
