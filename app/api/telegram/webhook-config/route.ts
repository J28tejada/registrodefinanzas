import { NextRequest, NextResponse } from 'next/server';
import { deleteWebhook, setWebhook } from '@/lib/chat/transports/telegram';
import { esAdmin } from '@/lib/supabase/admins';

export const dynamic = 'force-dynamic';

/**
 * Registra o borra el webhook del bot en Telegram.
 *
 * El bot es uno solo para toda la app, así que esto afecta a todos los
 * usuarios: va detrás de ADMIN_EMAILS, igual que la instancia de Evolution.
 */
export async function POST(req: NextRequest) {
  const permiso = await esAdmin();
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 403 });
  }

  let accion = 'registrar';
  try {
    const body = await req.json();
    if (typeof body?.accion === 'string') accion = body.accion;
  } catch {
    // sin cuerpo: se registra
  }

  try {
    if (accion === 'borrar') {
      await deleteWebhook();
      return NextResponse.json({ ok: true, accion });
    }
    await setWebhook();
    return NextResponse.json({ ok: true, accion: 'registrar' });
  } catch (err) {
    // El motivo exacto que devolvió Telegram.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
