import { NextRequest, NextResponse } from 'next/server';
import { importarEstadoDeCuenta } from '@/lib/db';
import type { PedidoDeImportacion } from '@/lib/extractos/tipos';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

/**
 * Importa un estado de cuenta ya revisado. Es una puerta: la validación vive
 * en `lib/extractos-campos.ts` y la importación en una sola función SQL, las
 * mismas que usa el teléfono sin pasar por acá.
 */
export async function POST(req: NextRequest) {
  // El cuerpo se lee ANTES de `conSesion`: si el token llega con el reloj
  // corrido, `conSesion` vuelve a correr el handler, y un cuerpo ya leído no
  // se puede leer dos veces. Sin esto el reintento fallaría siempre.
  const cuerpo: unknown = await req.json().catch(() => null);

  return conSesion(async db => {
    if (typeof cuerpo !== 'object' || cuerpo === null) {
      return NextResponse.json(
        { error: 'El pedido de importación vino mal armado. No se anotó nada.' },
        { status: 400 },
      );
    }

    const res = await importarEstadoDeCuenta(db, cuerpo as PedidoDeImportacion);
    if (!res.ok) {
      // `faltaMigracion` viaja aparte para que la pantalla cambie el botón por
      // el aviso, igual que cuando lo detecta al cargar el contexto.
      return NextResponse.json(
        res.faltaMigracion ? { error: res.error, faltaMigracion: true } : { error: res.error },
        { status: 400 },
      );
    }
    return NextResponse.json(res.resultado);
  });
}
