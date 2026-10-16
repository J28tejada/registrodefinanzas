import { NextRequest, NextResponse } from 'next/server';
import { base64ABytes } from '@/lib/extractos/base64';
import { leerEstadoDeCuenta } from '@/lib/extractos/leer';
import { LIMITE_PDF_BYTES } from '@/lib/extractos/textos';
import type { CodigoDeLectura } from '@/lib/extractos/tipos';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';
// Leer un PDF de 3 páginas tarda menos de un segundo; el tope de pdf.js es de
// 15 y esto deja margen para el arranque en frío.
export const maxDuration = 30;

/** El PDF en base64 ocupa 4/3 de lo que pesa, más el resto del JSON. */
const LIMITE_CUERPO = Math.ceil(LIMITE_PDF_BYTES / 3) * 4 + 4096;
/** Una contraseña de PDF de banco es corta; algo enorme no es una contraseña. */
const LIMITE_CLAVE = 128;

function fallo(codigo: CodigoDeLectura, extra?: { motivo?: string; fecha?: string }) {
  // Solo el código: ni montos, ni nombres, ni la contraseña.
  console.warn(`[extractos] ${codigo}`);
  const status = codigo === 'NO_ES_PDF' || codigo === 'MUY_GRANDE' ? 400 : 422;
  return NextResponse.json({ codigo, ...extra }, { status });
}

/**
 * Lee un estado de cuenta: `{ pdf: <base64>, clave?: string }` → el estado
 * leído, cuadrado y limpio. No lee ni escribe ninguna tabla: comparar contra
 * lo anotado e importar lo hace cada app directo contra Supabase. Pasa por la
 * web solo porque el teléfono no puede correr pdf.js.
 *
 * El cuerpo se lee ANTES de `conSesion`: si el token llega con el reloj
 * corrido, `conSesion` vuelve a correr el handler, y un cuerpo ya consumido no
 * se puede leer dos veces.
 */
export async function POST(req: NextRequest) {
  const largo = Number(req.headers.get('content-length') ?? 0);
  if (largo > LIMITE_CUERPO) return fallo('MUY_GRANDE');

  const cuerpo = (await req.json().catch(() => null)) as { pdf?: unknown; clave?: unknown } | null;
  if (!cuerpo || typeof cuerpo.pdf !== 'string' || !cuerpo.pdf) return fallo('NO_ES_PDF');
  if (cuerpo.pdf.length > LIMITE_CUERPO) return fallo('MUY_GRANDE');
  const bytes = base64ABytes(cuerpo.pdf);
  if (!bytes) return fallo('NO_ES_PDF');
  if (bytes.length > LIMITE_PDF_BYTES) return fallo('MUY_GRANDE');
  const clave = typeof cuerpo.clave === 'string' && cuerpo.clave ? cuerpo.clave.slice(0, LIMITE_CLAVE) : undefined;

  return conSesion(async () => {
    const r = await leerEstadoDeCuenta(bytes, clave);
    if (!r.ok) {
      return fallo(r.codigo, {
        ...(r.motivo ? { motivo: r.motivo } : {}),
        ...(r.fecha ? { fecha: r.fecha } : {}),
      });
    }
    console.log(`[extractos] leído: ${r.paginas} páginas, ${r.extracto.lineas.length} líneas, ${r.extracto.formato}`);
    return NextResponse.json({ extracto: r.extracto, paginas: r.paginas });
  });
}
