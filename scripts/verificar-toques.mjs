/**
 * Avisa cuando algo del teléfono se puede tocar y no hace nada.
 *
 * Existe porque el mismo error apareció dos veces y ninguna herramienta lo vio:
 *
 * 1. `ModalDeMovimiento` estaba importado en `Estructura` y no se dibujaba. El
 *    botón + del medio de la barra prendía `globalAddOpen` y no pasaba nada.
 * 2. El selector de cuentas no existía. La píldora de la barra de arriba
 *    llamaba a `setSelectorOpen(true)` y tampoco pasaba nada.
 *
 * Las dos compilaban, pasaban los tipos y no imprimían un solo error. Son
 * botones que se ven bien, se hunden al tocarlos y no llevan a ningún lado.
 *
 * Busca dos cosas:
 *
 * - Un `<Pressable>` sin `onPress` que no sea hijo de un `<Link asChild>`.
 * - Un valor del contexto que nadie lee fuera del archivo que lo define: si se
 *   expone un `setX` y nunca se mira `x`, ese `setX` no mueve nada.
 *
 *   node scripts/verificar-toques.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOVIL = path.join(RAIZ, 'mobile');

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre.startsWith('.')) continue;
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (p.endsWith('.tsx')) salida.push(p);
  }
  return salida;
}

const relativo = a => path.relative(RAIZ, a);
const hallazgos = [];

const fuentes = [
  ...archivos(path.join(MOVIL, 'app')),
  ...archivos(path.join(MOVIL, 'componentes')),
];

// ── 1. Toques sin manejador ──────────────────────────────────────────────────
for (const archivo of fuentes) {
  const lineas = readFileSync(archivo, 'utf8').split('\n');
  for (let i = 0; i < lineas.length; i++) {
    if (!lineas[i].includes('<Pressable')) continue;

    // La etiqueta de apertura puede ocupar varios renglones.
    const bloque = [];
    for (let j = i; j < Math.min(i + 14, lineas.length); j++) {
      bloque.push(lineas[j]);
      if (/\/?>\s*$/.test(lineas[j].trimEnd())) break;
    }
    if (bloque.join('\n').includes('onPress')) continue;

    // `<Link ... asChild>` le pasa el onPress a su hijo: ese no está muerto.
    if (lineas.slice(Math.max(0, i - 3), i).join('\n').includes('asChild')) continue;

    hallazgos.push({
      donde: `${relativo(archivo)}:${i + 1}`,
      que: '<Pressable> sin onPress',
      arreglo: 'o le falta el manejador, o tendría que ser una View',
    });
  }
}

// ── 2. Valores de contexto que nadie lee ─────────────────────────────────────
const contextos = fuentes.filter(f => path.basename(f).startsWith('Contexto'));
for (const archivo of contextos) {
  const texto = readFileSync(archivo, 'utf8');
  const interfaz = texto.match(/interface Contexto \{([\s\S]*?)\n\}/);
  if (!interfaz) continue;

  const claves = [...interfaz[1].matchAll(/^\s{2}(\w+)\??:/gm)].map(m => m[1]);
  const otros = fuentes.filter(f => f !== archivo);

  for (const clave of claves) {
    // `setAlgo` no cuenta como lectura de `algo`: justamente ese era el error.
    const usado = otros.some(f => {
      const t = readFileSync(f, 'utf8');
      return new RegExp(`(?<!set)\\b${clave}\\b`).test(t);
    });
    if (usado) continue;
    hallazgos.push({
      donde: `${relativo(archivo)}`,
      que: `el contexto expone «${clave}» y nadie lo lee`,
      arreglo: 'falta la pantalla o el componente que lo mira, o sobra el campo',
    });
  }
}

if (hallazgos.length === 0) {
  console.log('✓ ningún toque que no haga nada');
  process.exit(0);
}

console.error(`\n✗ ${hallazgos.length} cosa(s) que se pueden tocar y no hacen nada:\n`);
for (const h of hallazgos) {
  console.error(`  ${h.donde}  ${h.que}`);
  console.error(`     ${h.arreglo}\n`);
}
process.exit(1);
