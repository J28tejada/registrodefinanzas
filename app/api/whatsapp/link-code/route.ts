import { NextRequest, NextResponse } from 'next/server';
import { createLinkCode } from '@/lib/whatsapp/db';
import { LINK_CODE_TTL_MIN } from '@/lib/whatsapp/config';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/**
 * Genera el código de un solo uso que el usuario ve en la app y manda por
 * WhatsApp. Sin esto, cualquier número que le escriba al bot podría anotar
 * movimientos en las finanzas de otro.
 */
export async function POST(req: NextRequest) {
  return conSesion(async db => {
    try {
      const body = await req.json().catch(() => ({}));
      const ledgerId = typeof body?.ledger_id === 'string' && body.ledger_id ? body.ledger_id : null;

      const { code, expires_at } = await createLinkCode(db.supabase, db.userId, ledgerId);
      return NextResponse.json({ code, expires_at, ttl_min: LINK_CODE_TTL_MIN });
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `No se pudo generar el código: ${detalle}` }, { status: 500 });
    }
  });
}
