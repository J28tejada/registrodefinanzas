import { NextRequest, NextResponse } from 'next/server';
import { createCategory, getCategoriesWithUsage } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { leerIconoYColor } from './validacion';
import { sugerirIcono } from '@/lib/iconos-categoria';

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
    const b = await req.json();
    const { name, type, ledger_id: ledgerId } = b;

    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }
    if (!TIPOS.includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    }
    if (typeof ledgerId !== 'string' || !ledgerId) {
      return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
    }

    const dibujo = leerIconoYColor(b);
    if (!dibujo.ok) return NextResponse.json({ error: dibujo.error }, { status: 400 });

    // Sin ícono elegido, el que le pegue al nombre. Va acá y no en cada
    // pantalla: se crean categorías desde el administrador y desde
    // Presupuestos, y la que se olvide de sugerir dejaría un círculo vacío.
    // `null` explícito sigue siendo "sin ícono": solo se completa lo ausente.
    const campos = dibujo.campos;
    if (campos.icon === undefined) campos.icon = sugerirIcono(String(name));

    const res = await createCategory(db, {
      ledger_id: ledgerId, name, type, ...campos,
    });
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json(res, { status: 201 });
  });
}
