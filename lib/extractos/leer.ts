/**
 * SOLO SERVIDOR (importa `pdf.ts`, que importa unpdf). La entrada de la ruta
 * `POST /api/statements/leer`: del PDF al estado de cuenta leído, cuadrado y
 * limpio.
 *
 * Nunca tira: cualquier fallo vuelve como un código. Lo que se tira dentro de
 * `conSesion` termina en el log tal cual, y acá adentro hay saldos y nombres.
 */
import { detectarFormato } from './formatos';
import { interpretar } from './interpretar';
import { ErrorDeLectura, fragmentosDePdf, traducirErrorDePdf } from './pdf';
import { agruparRenglones } from './renglones';
import { LIMITE_PDF_BYTES } from './textos';
import type { ResultadoDeLectura } from './tipos';

/**
 * Un estado mensual del Popular tiene 3 páginas y unas 70 líneas. Los topes
 * dejan muchísimo margen y frenan un PDF que no es lo que dice ser antes de
 * que se coma los 30 segundos de la función.
 */
export const TOPES = { paginas: 20, lineas: 1000, tiempoMs: 15_000 };

export async function leerEstadoDeCuenta(bytes: Uint8Array, clave?: string): Promise<ResultadoDeLectura> {
  if (bytes.length > LIMITE_PDF_BYTES) return { ok: false, codigo: 'MUY_GRANDE' };

  try {
    const { fragmentos, paginas } = await fragmentosDePdf(bytes, {
      clave, maxPaginas: TOPES.paginas, tiempoMs: TOPES.tiempoMs,
    });
    // Un PDF escaneado es una imagen por página: pdf.js no encuentra texto.
    if (fragmentos.length === 0) return { ok: false, codigo: 'SIN_TEXTO' };

    const renglones = agruparRenglones(fragmentos);
    const formato = detectarFormato(renglones);
    if (!formato) return { ok: false, codigo: 'FORMATO_DESCONOCIDO' };

    const cruda = formato.leer(renglones);
    if ('error' in cruda) return { ok: false, codigo: cruda.error };
    if (cruda.lineas.length > TOPES.lineas) throw new ErrorDeLectura('MUY_LARGO');

    const r = interpretar(cruda);
    if (!r.ok) return r;
    return { ok: true, extracto: r.extracto, paginas };
  } catch (err) {
    return { ok: false, codigo: traducirErrorDePdf(err) };
  }
}
