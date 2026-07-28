import { NextRequest, NextResponse } from 'next/server';
import { conSesion } from '@/lib/supabase/session';
import { urlFirmadaRecibo } from '@/lib/chat/db';

export const dynamic = 'force-dynamic';

/**
 * Redirige a una URL firmada del comprobante. El bucket es privado: el enlace
 * dura unos minutos y solo se emite para rutas del propio usuario.
 */
export async function GET(req: NextRequest) {
  return conSesion(async db => {
    const path = req.nextUrl.searchParams.get('path');
    if (!path) {
      return NextResponse.json({ error: 'Falta la ruta del comprobante' }, { status: 400 });
    }
    // La primera carpeta de la ruta es el dueño: sin esto, cambiando el
    // parámetro se podría pedir el recibo de otro.
    if (!path.startsWith(`${db.userId}/`)) {
      return NextResponse.json({ error: 'Ese comprobante no es tuyo' }, { status: 403 });
    }

    const url = await urlFirmadaRecibo(db.supabase, path);
    if (!url) {
      return NextResponse.json({ error: 'El comprobante ya no está disponible' }, { status: 404 });
    }
    return NextResponse.redirect(url);
  });
}
