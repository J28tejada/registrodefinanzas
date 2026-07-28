import { NextRequest, NextResponse } from 'next/server';
import { createLinkCode, LINK_CODE_TTL_MIN } from '@/lib/whatsapp/db';

export const dynamic = 'force-dynamic';

/**
 * Genera el código de un solo uso que el usuario ve en la app y manda por
 * WhatsApp. Sin esto, cualquier número que le escriba al bot podría anotar
 * movimientos en tus finanzas.
 */
export async function POST(req: NextRequest) {
  try {
    let ledgerId: string | null = null;
    try {
      const body = await req.json();
      ledgerId = typeof body?.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;
    } catch {
      // sin cuerpo: el número queda sin cuenta asignada
    }

    const code = await createLinkCode(ledgerId);
    return NextResponse.json({ code: code.code, expires_at: code.expires_at, ttl_min: LINK_CODE_TTL_MIN });
  } catch (err) {
    console.error(err);
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo generar el código: ${detalle}` }, { status: 500 });
  }
}
