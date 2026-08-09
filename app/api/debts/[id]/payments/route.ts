import { NextRequest, NextResponse } from 'next/server';
import { borrarPagoDeuda, getDebtPayments, registrarPagoDeuda, getSettings } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { fechaValida, hoyEnZona } from '@/lib/format';

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      return NextResponse.json(await getDebtPayments(db, id));
    } catch (err) {
      return NextResponse.json({ error: mensaje(err) }, { status: 500 });
    }
  });
}

/** Registra el pago y, con él, el gasto: una sola anotación, no dos. */
export async function POST(req: NextRequest, { params }: Contexto) {
  const { id } = await params;
  return conSesion(async db => {
    try {
      const b = await req.json();
      const monto = Number(b.amount);
      if (!Number.isFinite(monto) || monto <= 0) {
        return NextResponse.json({ error: 'El monto tiene que ser mayor que cero' }, { status: 400 });
      }

      const settings = await getSettings(db);
      const fecha = fechaValida(b.date, hoyEnZona(settings.timezone));

      const resultado = await registrarPagoDeuda(db, id, {
        amount: monto,
        date: fecha,
        ledger_id: typeof b.ledger_id === 'string' && b.ledger_id ? b.ledger_id : null,
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

/** Borra un pago y el gasto que había creado, para no dejarlo duplicado. */
export async function DELETE(req: NextRequest, { params }: Contexto) {
  await params;
  return conSesion(async db => {
    try {
      const pagoId = req.nextUrl.searchParams.get('payment_id');
      if (!pagoId) {
        return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 });
      }
      const borrado = await borrarPagoDeuda(db, pagoId);
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
