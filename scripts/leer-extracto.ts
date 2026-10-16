/**
 * Lee un estado de cuenta de verdad, en la máquina, y dice si se entendió.
 *
 *   npm run extracto -- ~/Descargas/estado.pdf [contraseña]
 *
 * Imprime SOLO números de conjunto: páginas, líneas, si cuadra, cuántas de
 * cada clase. Ni una descripción, ni un monto suelto, ni un nombre: la salida
 * de esto se pega en un chat o en un commit sin pensarlo dos veces, y el
 * estado de cuenta no puede viajar con ella. El PDF tampoco entra al repo
 * (`*.pdf` está en el .gitignore).
 */
import { readFileSync } from 'fs';
import { leerEstadoDeCuenta } from '../lib/extractos/leer';
import { MENSAJES_DE_LECTURA, MOTIVOS_NO_CUADRA } from '../lib/extractos/textos';
import type { ClaseDeLinea } from '../lib/extractos/tipos';

async function main() {
  const [ruta, clave] = process.argv.slice(2);
  if (!ruta) {
    console.error('Uso: npm run extracto -- <archivo.pdf> [contraseña]');
    process.exit(2);
  }

  const bytes = new Uint8Array(readFileSync(ruta));
  const r = await leerEstadoDeCuenta(bytes, clave);
  if (!r.ok) {
    const motivo = r.motivo ? ` · ${r.motivo} (${MOTIVOS_NO_CUADRA[r.motivo]})${r.fecha ? ' el ' + r.fecha : ''}` : '';
    console.log(`✗ ${r.codigo}${motivo}\n  ${MENSAJES_DE_LECTURA[r.codigo]}`);
    process.exit(1);
  }

  const e = r.extracto;
  const porClase = new Map<ClaseDeLinea, number>();
  for (const l of e.lineas) porClase.set(l.clase, (porClase.get(l.clase) ?? 0) + 1);
  const devoluciones = e.lineas.filter(l => l.clase === 'refund');
  const emparejadas = devoluciones.filter(l => l.devolucionDe).length;

  console.log(`formato     ${e.formato} · ${e.tipoDeCuenta} · ${e.moneda}`);
  console.log(`páginas     ${r.paginas}`);
  console.log(`líneas      ${e.conciliacion.lineas} = ${e.conciliacion.creditos} créditos + ${e.conciliacion.debitos} débitos`);
  console.log('cuadra      ✓ (saldo anterior, cada saldo, conteos, totales, cierre, signos y fechas)');
  console.log('por clase');
  for (const [clase, n] of [...porClase].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${clase}`);
  }
  console.log(`devoluciones con su compra en el estado: ${emparejadas} de ${devoluciones.length}`);
}

main().catch(() => {
  // Sin el error: puede traer partes del documento.
  console.error('✗ falló sin poder leer el archivo');
  process.exit(1);
});
