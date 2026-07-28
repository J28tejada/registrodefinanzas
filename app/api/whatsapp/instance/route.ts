import { NextRequest, NextResponse } from 'next/server';
import { connectInstance, createInstance, logoutInstance, setWebhook } from '@/lib/whatsapp/evolution';
import { esAdmin } from '@/lib/supabase/admins';

export const dynamic = 'force-dynamic';

/**
 * Acciones sobre la instancia de Evolution:
 *   crear     → crea la instancia y deja el webhook configurado
 *   webhook   → solo reconfigura el webhook
 *   conectar  → devuelve QR y, si mandás número, código de emparejamiento (§6.5)
 *   salir     → cierra la sesión
 */
export async function POST(req: NextRequest) {
  // La instancia es compartida: crearla o cerrarle la sesión afecta a todos.
  const permiso = await esAdmin();
  if (!permiso.ok) {
    return NextResponse.json({ error: permiso.motivo }, { status: 403 });
  }

  let accion = '';
  let numero: string | undefined;
  try {
    const body = await req.json();
    accion = body.accion;
    numero = typeof body.numero === 'string' && body.numero.trim() ? body.numero.replace(/\D/g, '') : undefined;
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  try {
    switch (accion) {
      case 'crear': {
        let yaExistia = false;
        try {
          await createInstance();
        } catch (err) {
          const detalle = err instanceof Error ? err.message : String(err);
          // Volver a crear una instancia existente no es un error a reportar.
          if (!/already in use|already exists|409|403/i.test(detalle)) throw err;
          yaExistia = true;
        }
        const webhook = await setWebhook();
        return NextResponse.json({ ok: true, yaExistia, webhook });
      }
      case 'webhook': {
        const webhook = await setWebhook();
        return NextResponse.json({ ok: true, webhook });
      }
      case 'conectar': {
        const res = await connectInstance(numero);
        return NextResponse.json(res);
      }
      case 'salir': {
        await logoutInstance();
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: `Acción desconocida: "${accion}"` }, { status: 400 });
    }
  } catch (err) {
    // El motivo exacto, no un "hubo un problema" (§5.6).
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: detalle }, { status: 502 });
  }
}
