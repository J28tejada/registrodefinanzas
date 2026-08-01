import { NextRequest, NextResponse } from 'next/server';
import { acceptInvite, peekInvite } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type Contexto = { params: Promise<{ code: string }> };

/** Muestra a qué cuenta invita el código, antes de aceptar. */
export async function GET(_req: NextRequest, { params }: Contexto) {
  return conSesion(async db => {
    const { code } = await params;
    const invitacion = await peekInvite(db, code);
    if (!invitacion) {
      return NextResponse.json({ error: 'Código inválido o vencido' }, { status: 404 });
    }
    return NextResponse.json(invitacion);
  });
}

export async function POST(_req: NextRequest, { params }: Contexto) {
  return conSesion(async db => {
    const { code } = await params;
    const resultado = await acceptInvite(db, code);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      ledger_id: resultado.ledger_id,
      ledger_name: resultado.ledger_name,
    });
  });
}
