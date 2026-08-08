import { NextRequest, NextResponse } from 'next/server';
import { createCategory, getCategoriesWithUsage } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

const TIPOS = ['income', 'expense'] as const;
const AMBITOS = ['personal', 'business'] as const;

export async function GET() {
  return conSesion(async db => {
    try {
      return NextResponse.json(await getCategoriesWithUsage(db));
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const { name, type, scope } = await req.json();

      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
      }
      if (!TIPOS.includes(type)) {
        return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
      }
      if (!AMBITOS.includes(scope)) {
        return NextResponse.json({ error: 'Ámbito inválido' }, { status: 400 });
      }

      const resultado = await createCategory(db, { name, type, scope });
      // Un nombre repetido es cosa del usuario, no una falla: 400, no 500.
      if ('error' in resultado) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json(resultado, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
