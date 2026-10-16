import { NextRequest, NextResponse } from 'next/server';
import { deshacerImportacion } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/** Deshace una importación entera. `{ importId }` es el que devolvió `importar`. */
export async function POST(req: NextRequest) {
  // Antes de `conSesion`, por el mismo motivo que en `importar`: su reintento
  // no puede volver a leer un cuerpo ya consumido.
  const cuerpo: unknown = await req.json().catch(() => null);

  return conSesion(async db => {
    const importId = typeof cuerpo === 'object' && cuerpo !== null
      ? (cuerpo as Record<string, unknown>).importId
      : undefined;
    if (typeof importId !== 'string') {
      return NextResponse.json({ error: 'Esa importación no existe.' }, { status: 400 });
    }

    const res = await deshacerImportacion(db, importId);
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ deshechas: res.deshechas });
  });
}
