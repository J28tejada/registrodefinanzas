/**
 * Los montos del banco, a centavos enteros.
 *
 * Sin `parseFloat` a propósito: '1,234.56' en decimal es 1234.5599999…, y
 * sumar 68 de esos para compararlos con el total del banco termina "casi"
 * cuadrando. En centavos, o cuadra exacto o no cuadra.
 */

/**
 * Lo que el Popular imprime como monto: miles con coma, siempre dos decimales
 * y, si es débito, un menos adelante. Nada más: '12.5' o '1.234,56' NO son
 * montos de este banco, y aceptarlos sería leer una referencia como plata.
 */
export const MONTO = /^-?\d{1,3}(,\d{3})*\.\d{2}$/;

/** '1,234.56' → 123456; '-0.20' → -20. Null si no tiene la forma exacta. */
export function aCentavos(texto: string): number | null {
  const t = texto.trim();
  if (!MONTO.test(t)) return null;
  const negativo = t.startsWith('-');
  // Sacar el signo, las comas y el punto deja los centavos como dígitos enteros.
  const digitos = t.replace(/[-,.]/g, '');
  const n = Number(digitos);
  if (!Number.isSafeInteger(n)) return null;
  // `0 * -1` es -0, y -0 no es igual a 0 para JSON.stringify ni para las pruebas.
  return negativo && n !== 0 ? -n : n;
}
