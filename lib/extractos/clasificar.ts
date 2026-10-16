/**
 * Qué es cada línea del banco: una compra, un retiro, un cargo, una
 * transferencia…
 *
 * Se decide con reglas fijas sobre el detalle UNIDO CON ESPACIOS, la primera
 * que coincide gana. Unido porque el banco parte el detalle donde le cae: el
 * 'POS W/D' de una compra a veces llega como 'PO' al final de un renglón y
 * 'W/D' al principio del siguiente, y pdf.js a veces se come la primera letra
 * ('OS W/D', 'OS CR RTN'). Las reglas están escritas para esas formas rotas,
 * sacadas del estado real.
 *
 * Lo que no coincide con nada queda 'other': nunca se adivina. Una línea mal
 * clasificada termina anotada como gasto o como ingreso sin que nadie la mire.
 */
import type { ClaseDeLinea } from './tipos';

export type Regla = [ClaseDeLinea, RegExp];

/**
 * La tabla del Banco Popular, en orden: la primera que coincide (y cuyo signo
 * corresponde) gana. 'transfer_out' acá quiere decir "una transferencia": la
 * dirección la pone el signo, y si es entre cuentas propias, el titular.
 */
export const REGLAS_POPULAR: Regla[] = [
  // Antes que la compra: la devolución de una compra con tarjeta también nombra
  // al comercio, y no trae W/D pero podría traerlo otro banco.
  ['refund', /\bCR\s*RTN\b|DEVOLUCI|\bREVERS/i],
  // 'POS W/D', 'PO' + 'W/D' partido entre renglones, 'OS W/D' sin la P.
  ['purchase', /\bW\s*\/\s*D\b|POS?W\/D/],
  // Las cuatro formas que usa el banco: 'RET DE C K', 'RET CHK', 'RET E CHK', 'RET DE CHK'.
  ['withdrawal', /\bRET\s+(?:(?:DE|E)\s+)?C\s?H?\s?K\b/],
  ['deposit', /\bDEP\b/],
  // El impuesto a las transferencias es 'PAGO IMPUESTO 0.15% DGII'. 'DGII' solo
  // no alcanza: una transferencia a la DGII es pagar impuestos, no un cargo del banco.
  ['fee', /\bCARGO\s+MENSUAL\b|\bPAGO\s+IMPUESTO\b|%\s*DGII\b|\bBANCASEGURO\b|COMISI[OÓ]N|INTER[EÉ]S(?:ES)?\s+CARGADO/i],
  ['interest', /\bINTER[EÉ]S/i],
  // 'MB a …', 'MB desde …', 'Pago ACH … a <cuenta>', 'TOKE* a/de …', 'LBTR …' y
  // '<cuenta>: <NOMBRE>'.
  ['transfer_out', /(?:^|\s)(?:MB\s+(?:a|desde)\s|Pago\s+ACH\b|TOKE\*|LBTR\b)|^\s*\d{6,}\s*:/i],
];

/** Qué signo admite cada clase. Una "compra" que suma plata no es una compra. */
const SIGNO: Partial<Record<ClaseDeLinea, 1 | -1>> = {
  purchase: -1, withdrawal: -1, fee: -1,
  deposit: 1, interest: 1, refund: 1,
};

export interface Contraparte {
  /** Como lo imprime el banco, sin cuenta ni montos. Puede ser ''. */
  nombre: string;
  /** El número de cuenta del otro lado, si lo imprime. Nunca sale entero del servidor. */
  cuenta: string | null;
}

export interface Clasificacion {
  clase: ClaseDeLinea;
  /** Solo para transferencias (de terceros o propias). */
  contraparte: Contraparte | null;
}

/**
 * Dónde está la contraparte en cada forma de transferencia. El primer grupo es
 * la cuenta (puede no haber) y el segundo, lo que sigue: el nombre.
 */
const CONTRAPARTES: RegExp[] = [
  /\bPago\s+ACH\b.*?\ba\s+(\d{4,})\s*(.*)$/i,
  /\bMB\s+(?:a|desde)\s+(\d{4,})\s*(.*)$/i,
  /\bLBTR\s+(\d{4,})\s+(.*)$/i,
  /^\s*(\d{6,})\s*:\s*(.*)$/,
  /\bTOKE\*\s*(?:a|de)\s+()(.*)$/i,
];

/** Sin tildes, en minúscula y solo letras: 'Gómez,' → 'gomez'. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Las palabras de un nombre que sirven para reconocerlo: 3 letras o más. */
export function tokensDeNombre(nombre: string): string[] {
  return normalizar(nombre).split(/[^a-zñ]+/).filter(t => t.length >= 3);
}

/**
 * ¿La contraparte es el mismo titular? Hacen falta dos palabras de su nombre,
 * y una tiene que ser el primer nombre.
 *
 * Dos y no una, porque 'ANA' sola es media República. Y el primer nombre
 * obligatorio porque un hermano comparte los dos apellidos: una transferencia
 * a él dada por propia quedaría omitida sin que nadie la vea, mientras que una
 * propia no reconocida solo queda "para revisar". Tolera el nombre recortado
 * ('ANA PRUEBA GOM') y dado vuelta con coma ('PRUEBA GOMEZ, ANA').
 */
export function esDelTitular(texto: string, titular: string): boolean {
  const delTitular = tokensDeNombre(titular);
  if (delTitular.length < 2) return false;
  const enTexto = new Set(tokensDeNombre(texto));
  const comunes = delTitular.filter(t => enTexto.has(t));
  return comunes.length >= 2 && enTexto.has(delTitular[0]);
}

/** El nombre de la contraparte sin la cola: la coma y lo que sigue, montos, referencias. */
function limpiarNombre(s: string): string {
  return s
    .split(',')[0]
    .split(/\b(?:RD|US)\$/)[0]
    .split(/\s+/)
    // Una palabra con dígitos es una referencia, no un nombre.
    .filter(p => p && !/\d/.test(p) && /[A-Za-zÀ-ÿ]/.test(p))
    .join(' ')
    .trim();
}

function contraparteDe(texto: string): Contraparte | null {
  for (const re of CONTRAPARTES) {
    const m = re.exec(texto);
    if (m) return { cuenta: m[1] || null, nombre: limpiarNombre(m[2] ?? '') };
  }
  return null;
}

export function clasificar(
  detalle: string[],
  centavos: number,
  titular: string,
  reglas: Regla[] = REGLAS_POPULAR,
): Clasificacion {
  const texto = detalle.join(' ').replace(/\s+/g, ' ').trim();
  const signo = centavos < 0 ? -1 : 1;

  for (const [clase, re] of reglas) {
    if (!re.test(texto)) continue;
    const pide = SIGNO[clase];
    // El signo no corresponde: sigue buscando. Un 'CR RTN' que resta no es una
    // devolución, y si nada más coincide termina en 'other', para revisar.
    if (pide && pide !== signo) continue;
    if (clase !== 'transfer_out' && clase !== 'transfer_in' && clase !== 'own_transfer') {
      return { clase, contraparte: null };
    }
    const contraparte = contraparteDe(texto);
    // Lo propio se mira sobre el detalle entero y no sobre el nombre ya
    // recortado: 'PRUEBA GOMEZ, ANA' tiene el primer nombre después de la coma.
    if (esDelTitular(texto, titular)) return { clase: 'own_transfer', contraparte };
    return { clase: signo < 0 ? 'transfer_out' : 'transfer_in', contraparte };
  }
  return { clase: 'other', contraparte: null };
}
