import { NextRequest, NextResponse } from 'next/server';
import { borrarPagoTarjeta, getCardPayments, getSettings, registrarPagoTarjeta } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { fechaValida, hoyEnZona } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      return NextResponse.json(await getCardPayments(db, id));
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

/**
 * Registra un pago a la tarjeta. A diferencia del pago de una deuda, NO crea
 * ningún movimiento: la compra que este pago salda ya se anotó como gasto el
 * día que se hizo, y anotarla otra vez contaría la misma plata dos veces.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json().catch(() => ({}));
      const monto = Number(b.amount);
      if (!Number.isFinite(monto) || monto <= 0) {
        return NextResponse.json({ error: 'El monto tiene que ser mayor que cero.' }, { status: 400 });
      }

      const settings = await getSettings(db);
      const fecha = fechaValida(b.date, hoyEnZona(settings.timezone));

      const resultado = await registrarPagoTarjeta(db, id, {
        amount: monto,
        date: fecha,
        source_card_id: typeof b.source_card_id === 'string' && b.source_card_id
          ? b.source_card_id
          : null,
        notes: typeof b.notes === 'string' ? b.notes : '',
      });
      if (!resultado.ok) {
        return NextResponse.json({ error: resultado.error }, { status: 400 });
      }
      return NextResponse.json(resultado.pago, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

/** Borra un pago. No hay movimiento que borrar con él: nunca se creó ninguno. */
export async function DELETE(req: NextRequest, { params }: Contexto) {
  await params;
  return conSesion(async db => {
    try {
      const pagoId = req.nextUrl.searchParams.get('payment_id');
      if (!pagoId) return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 });

      const borrado = await borrarPagoTarjeta(db, pagoId);
      if (!borrado) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
