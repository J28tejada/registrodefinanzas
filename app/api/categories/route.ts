import { NextRequest, NextResponse } from 'next/server';
import { createCategory, getCategoriesWithUsage } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

const TIPOS = ['income', 'expense'] as const;

/** Las categorías de una cuenta. Cada una tiene su propia lista. */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    const ledgerId = req.nextUrl.searchParams.get('ledger_id');
    if (!ledgerId) {
      return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
    }
    return NextResponse.json(await getCategoriesWithUsage(db, ledgerId));
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    const { name, type, ledger_id: ledgerId } = await req.json();

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }
    if (!TIPOS.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (typeof ledgerId !== 'string' || !ledgerId) {
      return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
    }

    const res = await createCategory(db, { ledger_id: ledgerId, name, type });
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res, { status: 201 });
  });
}
