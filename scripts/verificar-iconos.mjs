/**
 * Comprueba que el catálogo de íconos diga lo mismo en la web y en el teléfono.
 *
 * Las dos apps importan de paquetes distintos —`lucide-react` y
 * `lucide-react-native`— y por eso cada una tiene su mapa de clave a componente.
 * Dos listas escritas a mano se separan: alcanza con agregar un ícono de un lado
 * y olvidarlo del otro para que una categoría se dibuje distinta en el teléfono
 * y nadie se entere hasta verlo.
 *
 * Esto lo lee de los tres archivos y falla si no coinciden. Es estático a
 * propósito: `lucide-react-native` no se puede cargar fuera de Metro, así que
 * comparar en tiempo de ejecución no es una opción.
 *
 *   node scripts/verificar-iconos.mjs
 */
import { readFileSync } from 'fs';

const leer = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Las claves y su nombre de ícono, del catálogo compartido. */
function delCatalogo() {
  const s = leer('lib/categorias-catalogo.ts');
  const bloque = s.slice(s.indexOf('NOMBRES_DE_ICONO'), s.indexOf('NOMBRE_ICONO_POR_DEFECTO'));
  return new Map([...bloque.matchAll(/^ {2}([a-z]+): '([A-Z]\w*)',$/gm)].map(m => [m[1], m[2]]));
}

/** Las claves y su componente, de un mapa de plataforma. */
function delMapa(ruta) {
  const s = leer(ruta);
  const i = s.indexOf('ICONOS_CATEGORIA');
  const bloque = s.slice(i, s.indexOf('};', i));
  return new Map([...bloque.matchAll(/^ {2}([a-z]+): ([A-Z]\w*),$/gm)].map(m => [m[1], m[2]]));
}

/** Los grupos del selector: tienen que cubrir el catálogo, sin sobras. */
function grupos() {
  const s = leer('lib/categorias-catalogo.ts');
  return [...s.matchAll(/claves: \[([^\]]+)\]/g)]
    .flatMap(m => m[1].split(',').map(x => x.trim().replace(/'/g, '')))
    .filter(Boolean);
}

const catalogo = delCatalogo();
const web = delMapa('lib/iconos-categoria.ts');
const movil = delMapa('mobile/lib/iconos-categoria.ts');
const enGrupos = grupos();

const fallas = [];
const comparar = (nombre, mapa) => {
  for (const [clave, icono] of catalogo) {
    if (!mapa.has(clave)) { fallas.push(`${nombre}: le falta la clave '${clave}'`); continue; }
    if (mapa.get(clave) !== icono) {
      fallas.push(`${nombre}: '${clave}' usa ${mapa.get(clave)} y el catálogo dice ${icono}`);
    }
  }
  for (const clave of mapa.keys()) {
    if (!catalogo.has(clave)) fallas.push(`${nombre}: tiene '${clave}', que no está en el catálogo`);
  }
};

comparar('web', web);
comparar('móvil', movil);

for (const clave of catalogo.keys()) {
  if (!enGrupos.includes(clave)) fallas.push(`ningún grupo del selector muestra '${clave}'`);
}
for (const clave of enGrupos) {
  if (!catalogo.has(clave)) fallas.push(`un grupo apunta a '${clave}', que no existe en el catálogo`);
}
const repetidas = enGrupos.filter((c, i) => enGrupos.indexOf(c) !== i);
if (repetidas.length) fallas.push(`claves en más de un grupo: ${[...new Set(repetidas)].join(', ')}`);

if (fallas.length) {
  console.error(`✗ ${fallas.length} diferencia(s) entre el catálogo y los mapas:\n`);
  fallas.forEach(f => console.error('  ' + f));
  process.exit(1);
}
console.log(`✓ ${catalogo.size} íconos, iguales en la web y en el teléfono`);
