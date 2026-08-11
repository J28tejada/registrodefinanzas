import { NextRequest, NextResponse } from 'next/server';
import { deleteCard, updateCard } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { Card, CardKind } from '@/lib/types';

type Contexto = { params: Promise<{ id: string }> };

const TIPOS: CardKind[] = ['credit', 'debit', 'cash', 'transfer', 'other'];

export async function PATCH(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const cambios: Partial<Omit<Card, 'id' | 'created_at'>> = {};

      if (b.name !== undefined) {
        const name = String(b.name).trim();
        if (!name) return NextResponse.json({ error: 'El nombre no puede quedar vacío.' }, { status: 400 });
        cambios.name = name;
      }
      if (b.kind !== undefined) {
        if (!TIPOS.includes(b.kind)) {
          return NextResponse.json({ error: 'Tipo de tarjeta inválido.' }, { status: 400 });
        }
        cambios.kind = b.kind;
      }
      if (b.last4 !== undefined) {
        const last4 = String(b.last4).replace(/\D/g, '').slice(-4);
        if (last4 && last4.length !== 4) {
          return NextResponse.json({ error: 'Los últimos dígitos tienen que ser cuatro.' }, { status: 400 });
        }
        cambios.last4 = last4;
      }
      if (b.issuer !== undefined) cambios.issuer = String(b.issuer).trim();
      if (b.color !== undefined) cambios.color = b.color;
      if (b.archived !== undefined) cambios.archived = Boolean(b.archived);

      if (Object.keys(cambios).length === 0) {
        return NextResponse.json({ error: 'No hay nada que cambiar.' }, { status: 400 });
      }

      const res = await updateCard(db, id, cambios);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json(res.card);
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const res = await deleteCard(db, id);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
