import { NextRequest, NextResponse } from 'next/server';
import { cargarContextoDeExtracto } from '@/lib/db';
import { leerConsultaDeContexto } from '@/lib/extractos-campos';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/**
 * Lo que la web necesita para cotejar un estado de cuenta ya leído contra lo
 * anotado. El teléfono no pasa por acá: llama a `cargarContextoDeExtracto`
 * directo, con su sesión.
 *
 *   GET /api/statements/contexto?banco=popular&ultimos4=1234&desde=2026-09-01&hasta=2026-09-30
 */
export async function GET(req: NextRequest) {
  // Sin `try` propio: `conSesion` traduce el fallo a JSON y reintenta los
  // desfasajes de reloj, que atajados acá se darían por perdidos.
  return conSesion(async db => {
    const p = req.nextUrl.searchParams;
    const leida = leerConsultaDeContexto({
      banco: p.get('banco'),
      ultimos4: p.get('ultimos4'),
      desde: p.get('desde'),
      hasta: p.get('hasta'),
    });
    if (!leida.ok) return NextResponse.json({ error: leida.error }, { status: 400 });

    return NextResponse.json(await cargarContextoDeExtracto(db, leida.consulta));
  });
}
