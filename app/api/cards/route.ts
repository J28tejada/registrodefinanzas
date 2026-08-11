import { NextRequest, NextResponse } from 'next/server';
import { createCard, getCardsWithUsage, getSettings } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes } from '@/lib/format';
import { CardKind } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TIPOS: CardKind[] = ['credit', 'debit', 'cash', 'transfer', 'other'];

export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const mes = req.nextUrl.searchParams.get('month');
      const settings = await getSettings(db);
      const referencia = /^\d{4}-\d{2}$/.test(mes ?? '') ? `${mes}-01` : hoyEnZona(settings.timezone);
      const { start, end } = limitesDelMes(referencia);
      const incluirArchivadas = req.nextUrl.searchParams.get('archivadas') === '1';

      const cards = await getCardsWithUsage(db, start, end, incluirArchivadas);
      return NextResponse.json({ month: start.slice(0, 7), cards });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));

      const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Ponele un nombre.' }, { status: 400 });

      const kind: CardKind = TIPOS.includes(b.kind) ? b.kind : 'credit';

      // Solo los últimos cuatro dígitos, nunca el número completo: no hace falta
      // para distinguir dos tarjetas y guardarlo entero sería un riesgo sin uso.
      const last4 = typeof b.last4 === 'string' ? b.last4.replace(/\D/g, '').slice(-4) : '';
      if (last4 && last4.length !== 4) {
        return NextResponse.json({ error: 'Los últimos dígitos tienen que ser cuatro.' }, { status: 400 });
      }

      const res = await createCard(db, {
        name,
        kind,
        last4,
        issuer: typeof b.issuer === 'string' ? b.issuer.trim() : '',
        color: b.color ?? 'blue',
      });
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json(res.card, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
