/**
 * La clave de cada línea: lo que hace que subir el mismo PDF dos veces no
 * anote nada dos veces.
 *
 * `fecha de entrada | centavos con signo | saldo después | repetición`, la
 * MISMA fórmula que arma `importar_estado_de_cuenta` en la migración 0024. La
 * función no confía en la que manda el cliente: la vuelve a armar con estos
 * mismos datos, así que si las dos fórmulas se separan, la importación sigue
 * siendo correcta pero el cliente muestra "nueva" una línea ya importada.
 *
 * El saldo es lo único que separa dos retiros iguales del mismo día; la
 * repetición cubre el caso en que ni el saldo los separa (un −40, +40, −40).
 */

export function claveDeLinea(asentada: string, centavos: number, saldo: number, n: number): string {
  return `${asentada}|${centavos}|${saldo}|${n}`;
}

/**
 * Las claves de un estado entero, en orden. `n` cuenta cuántas líneas
 * ANTERIORES del mismo estado tienen la misma terna; la primera es 0.
 */
export function clavesDelEstado(
  lineas: { asentada: string; centavos: number; saldoCentavos: number }[],
): string[] {
  const vistas = new Map<string, number>();
  return lineas.map(l => {
    const terna = `${l.asentada}|${l.centavos}|${l.saldoCentavos}`;
    const n = vistas.get(terna) ?? 0;
    vistas.set(terna, n + 1);
    return claveDeLinea(l.asentada, l.centavos, l.saldoCentavos, n);
  });
}
