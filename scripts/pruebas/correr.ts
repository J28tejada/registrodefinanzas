/**
 * Entrada de las pruebas: enseña el alias "@/" que usa el proyecto.
 *
 *   npm test            corre todas
 *   npm test ciclo      corre una
 *
 * Sin framework a propósito: son funciones puras y aserciones, y meter uno solo
 * para esto traería configuración, transformadores y una versión más que
 * mantener alineada entre la web y el móvil.
 */
import path from 'path';
import fs from 'fs';
import Module from 'module';

const RAIZ = path.resolve(__dirname, '../..');
const mod = Module as unknown as { _resolveFilename: (p: string, ...r: unknown[]) => string };
const original = mod._resolveFilename;
mod._resolveFilename = function (pedido: string, ...resto: unknown[]) {
  if (pedido.startsWith('@/')) pedido = path.join(RAIZ, pedido.slice(2));
  return original.call(this, pedido, ...resto);
};

const soloEsta = process.argv[2];
const archivos = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.prueba.ts'))
  .filter(f => !soloEsta || f.includes(soloEsta))
  .sort();

if (archivos.length === 0) {
  console.error(soloEsta ? `No hay ninguna prueba que contenga "${soloEsta}".` : 'No hay pruebas.');
  process.exit(1);
}

let fallaron = 0;
for (const archivo of archivos) {
  const nombre = archivo.replace('.prueba.ts', '');
  process.stdout.write(`\n── ${nombre} ─────────────────────────────\n`);
  try {
    require(path.join(__dirname, archivo));
  } catch (err) {
    fallaron++;
    console.error(`✗ ${nombre} explotó:`, err instanceof Error ? err.message : err);
  }
}

// Cada prueba suma a este contador global al fallar.
const globales = globalThis as unknown as { __fallas?: number };
const total = (globales.__fallas ?? 0) + fallaron;
console.log(total === 0 ? '\n✓ todo en orden' : `\n✗ ${total} falla(s)`);
process.exit(total > 0 ? 1 : 0);
