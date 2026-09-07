import { NextRequest, NextResponse } from 'next/server';
import { deleteCategory, updateCategory } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerIconoYColor } from '../validacion';

type Contexto = { params: Promise<{ id: string }> };

/** Renombrar arrastra los movimientos y presupuestos que la usaban. */
export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    const b = await req.json().catch(() => ({}));

    const cambios: { name?: string; icon?: string | null; color?: string | null } = {};
    if (b.name !== undefined) {
      if (typeof b.name !== 'string' || !b.name.trim()) {
        return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      }
      cambios.name = b.name;
    }

    const dibujo = leerIconoYColor(b);
    if (!dibujo.ok) return NextResponse.json({ error: dibujo.error }, { status: 400 });
    Object.assign(cambios, dibujo.campos);

    if (Object.keys(cambios).length === 0) {
      return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });
    }

    const resultado = await updateCategory(db, id, cambios);
    if ('error' in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json(resultado);
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    const resultado = await deleteCategory(db, id);
    // "La usan 5 movimientos" es una respuesta esperable, no un error del
    // sistema: el 400 deja que la pantalla la muestre tal cual.
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  });
}
