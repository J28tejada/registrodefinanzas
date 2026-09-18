/**
 * Avisa cuando el código del teléfono usa una clase que NativeWind no dibuja.
 *
 * Compartir los strings de Tailwind entre la web y el móvil es lo que hace que
 * las pantallas queden iguales — pero no todas las clases sobreviven el viaje.
 * Unas avisan al compilar; otras, las peores, se descartan EN SILENCIO:
 * `h-[calc(100dvh-8rem)]` no produce nada, no imprime nada, y la pantalla queda
 * sin alto sin que haya un solo error en consola.
 *
 * La lista sale de compilar las 567 clases reales de la app con el compilador de
 * NativeWind 4.2.7, no de la documentación.
 *
 *   node scripts/verificar-clases.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOVIL = path.join(RAIZ, 'mobile');

/** clase (o patrón) -> con qué se reemplaza en React Native. */
const MUERTAS = [
  [/^grid$/, 'no existe: usá flex-row + flex-wrap'],
  [/^(sm:|md:|lg:)?grid-cols-\d+$/, 'grid es solo web: repartí con flex-row y w-1/N'],
  [/^(sm:|md:|lg:)?col-span-\d+$/, 'sin grid no aplica: w-full en el hijo'],
  [/^space-[xy]-/, 'NativeWind 4 la sacó: usá gap-N en el padre'],
  [/^divide-[xy]/, 'no existe: poné el borde en cada hijo'],
  [/^fixed$/, 'no existe: absolute dentro de un padre flex-1'],
  [/^sticky$/, 'no existe: sacá el elemento del ScrollView'],
  [/^(sm:|md:)?(block|inline|inline-flex|inline-block)$/, 'display no aplica: render condicional'],
  [/^w-fit$/, 'no existe: self-start'],
  [/^overflow-[xy]-(auto|scroll)$/, 'no existe: usá ScrollView + overflow-hidden'],
  [/^overflow-scroll$/, 'no existe: usá ScrollView'],
  [/^truncate$/, 'pierde el recorte: usá line-clamp-1'],
  [/^whitespace-/, 'no existe: <Texto numberOfLines={1}>'],
  [/^(break-words|break-all|hyphens-\w+)$/, 'sin equivalente: el texto se corta con … en vez de con guion'],
  [/^tabular-nums$/, "no existe como clase: style={{ fontVariant: ['tabular-nums'] }}"],
  [/^ring(-|$)/, 'el preset nativo no la genera: border-2 + border-transparent apagado'],
  [/^ring-offset/, 'no existe'],
  [/^backdrop-/, 'no existe: expo-blur, o subí el negro del fondo'],
  [/^(visible|invisible)$/, 'no se generan: opacity-100 / opacity-0 + pointerEvents'],
  [/^appearance-none$/, 'no aplica: borrala'],
  [/^accent-/, 'no existe: el checkbox hay que dibujarlo'],
  [/^cursor-/, 'no aplica: borrala'],
  [/^placeholder-(?!.*:)/, 'sintaxis vieja: placeholder:text-...'],
  [/^object-/, 'no aplica: prop contentFit de expo-image'],
  [/^list-/, 'sin equivalente'],
  [/^(hover|group-hover):/, 'nunca se dispara con el dedo: active:'],
];

/** Las que se descartan sin decir nada. Son las peligrosas. */
const SILENCIOSAS = [
  [/\[[^\]]*\bcalc\(/, 'calc() no se resuelve y la declaración queda VACÍA, sin warning: usá flex-1'],
  [/\[[^\]]*\bmin\(/, 'min() no se resuelve, sin warning: poné el valor y un max-w-[%]'],
  [/\[[^\]]*\bmax\(/, 'max() no se resuelve, sin warning'],
  [/\[[^\]]*dvh/, 'dvh no existe (vh sí): usá flex-1'],
  /*
   * Un tamaño de letra arbitrario SÍ se dibuja, pero con otro interlineado.
   *
   * En el navegador `text-[11px]` sale con `line-height: 16.5px` —Tailwind le
   * pone 1.5— y en NativeWind sale `normal`, que a 11px son 14. Nada falla:
   * simplemente cada renglón queda 2,5px más bajo del lado del teléfono, y como
   * los tamaños chicos son los de las etiquetas —dos o tres por tarjeta— una
   * pieza entera termina 30 o 40px más corta. Medido: el estado de cuenta daba
   * 697px en la web y 652 en el teléfono.
   *
   * Los tres tamaños que la app usa están nombrados en los dos
   * `tailwind.config`, con el interlineado escrito: text-2xs, text-3xs, text-4xs.
   */
  [/^text-\[\d+px\]$/, 'el interlineado no viaja: usá text-2xs (11), text-3xs (10) o text-4xs (9)'],
];

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre === '.expo') continue;
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) salida.push(...archivos(p));
    else if (/\.(tsx|ts)$/.test(nombre)) salida.push(p);
  }
  return salida;
}

const hallazgos = [];
for (const archivo of archivos(MOVIL)) {
  const texto = readFileSync(archivo, 'utf8');
  texto.split('\n').forEach((linea, i) => {
    // Las clases viajan en className="..." o en plantillas `...`.
    for (const m of linea.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const crudo = m[1] ?? m[2] ?? '';
      // En una plantilla, lo interpolado no se puede leer: se saltea.
      for (const clase of crudo.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter(Boolean)) {
        for (const [patron, arreglo] of MUERTAS) {
          if (patron.test(clase)) {
            hallazgos.push({ archivo, linea: i + 1, clase, arreglo, silenciosa: false });
          }
        }
        for (const [patron, arreglo] of SILENCIOSAS) {
          if (patron.test(clase)) {
            hallazgos.push({ archivo, linea: i + 1, clase, arreglo, silenciosa: true });
          }
        }
      }
    }
  });
}

if (hallazgos.length === 0) {
  console.log('✓ ninguna clase que NativeWind no dibuje');
  process.exit(0);
}

const relativo = a => path.relative(RAIZ, a);
console.error(`✗ ${hallazgos.length} clase(s) que no llegan al teléfono:\n`);
for (const h of hallazgos.sort((a, b) => Number(b.silenciosa) - Number(a.silenciosa))) {
  const marca = h.silenciosa ? '‼' : '·';
  console.error(`  ${marca} ${relativo(h.archivo)}:${h.linea}  ${h.clase}`);
  console.error(`     ${h.arreglo}`);
}
if (hallazgos.some(h => h.silenciosa)) {
  console.error('\n  ‼ = se descarta sin ningún error en consola.');
}
process.exit(1);
