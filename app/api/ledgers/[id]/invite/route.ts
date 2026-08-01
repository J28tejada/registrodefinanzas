import { NextRequest, NextResponse } from 'next/server';
import { createInvite } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type Contexto = { params: Promise<{ id: string }> };

/** Genera un código nuevo y descarta el anterior de esa cuenta. */
export async function POST(_req: NextRequest, { params }: Contexto) {
  return conSesion(async db => {
    const { id } = await params;
    const resultado = await createInvite(db, id);
    if ('error' in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: 403 });
    }
    return NextResponse.json(resultado, { status: 201 });
  });
}
