/** Lo mínimo para escribir pruebas: comparar y contar. */
const globales = globalThis as unknown as { __fallas?: number };

export function crear(grupo: string) {
  let ok = 0;
  const falla = (mensaje: string) => {
    globales.__fallas = (globales.__fallas ?? 0) + 1;
    console.error(`  ✗ ${mensaje}`);
  };

  return {
    /** Compara por valor, no por referencia: sirve para objetos y arreglos. */
    igual(nombre: string, real: unknown, esperado: unknown) {
      if (JSON.stringify(real) === JSON.stringify(esperado)) { ok++; return; }
      falla(`${nombre}\n      esperaba ${JSON.stringify(esperado)}\n      obtuvo   ${JSON.stringify(real)}`);
    },
    cierto(nombre: string, condicion: boolean) {
      if (condicion) { ok++; return; }
      falla(nombre);
    },
    falla,
    /** Una que ya se sabe que pasó: para los barridos que cuentan aparte. */
    suma(n = 1) { ok += n; },
    resumen(extra = '') {
      console.log(`  ${ok} comprobaciones${extra ? ' · ' + extra : ''}`);
    },
  };
}
