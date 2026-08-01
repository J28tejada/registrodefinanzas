import { NextRequest, NextResponse } from 'next/server';
import { getLedgerMembers, getLedgerRole, removeLedgerMember } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Contexto) {
  return conSesion(async db => {
    const { id } = await params;
    if (!(await getLedgerRole(db, id))) {
      return NextResponse.json({ error: 'Sin acceso a esta cuenta' }, { status: 403 });
    }
    return NextResponse.json(await getLedgerMembers(db, id));
  });
}

/**
 * Quita a alguien. El dueño puede sacar a cualquiera; un miembro solo puede
 * sacarse a sí mismo, que es salirse de la cuenta.
 */
export async function DELETE(req: NextRequest, { params }: Contexto) {
  return conSesion(async db => {
    const { id } = await params;
    const objetivo = req.nextUrl.searchParams.get('user_id');
    if (!objetivo) {
      return NextResponse.json({ error: 'Falta user_id' }, { status: 400 });
    }

    const resultado = await removeLedgerMember(db, id, objetivo);
    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  });
}
