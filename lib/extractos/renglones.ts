/**
 * De fragmentos sueltos a renglones.
 *
 * pdf.js no devuelve líneas: devuelve pedazos de texto con su posición, en el
 * orden en que el PDF los dibujó (que no es el de lectura: en el estado del
 * Popular el nombre del titular de la página 2 llega al final). Un renglón son
 * los pedazos que comparten la altura, con una tolerancia porque el banco no
 * siempre alinea al décimo de punto: el monto de BALANCE AL CORTE está 0.6 pt
 * más abajo que su etiqueta.
 */
import type { FragmentoPdf, RenglonPdf } from './tipos';

export function agruparRenglones(fragmentos: FragmentoPdf[], tolY = 1.5): RenglonPdf[] {
  const utiles = fragmentos
    .filter(f => f.s.trim() !== '')
    .map(f => ({ ...f, s: f.s.trim() }));
  // Página por página, de arriba hacia abajo (en PDF la y crece hacia arriba)
  // y de izquierda a derecha.
  utiles.sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);

  const renglones: RenglonPdf[] = [];
  let actual: RenglonPdf | null = null;
  for (const f of utiles) {
    // Se compara contra la altura con que ARRANCÓ el renglón, no contra el
    // último pedazo: así una inclinación chica no va encadenando renglones.
    if (actual && actual.pagina === f.pagina && Math.abs(actual.y - f.y) < tolY) {
      actual.fragmentos.push(f);
    } else {
      actual = { pagina: f.pagina, y: f.y, fragmentos: [f] };
      renglones.push(actual);
    }
  }
  for (const r of renglones) r.fragmentos.sort((a, b) => a.x - b.x);
  return renglones;
}

/** El renglón como texto, con un espacio entre pedazos. */
export function textoDe(r: RenglonPdf): string {
  return r.fragmentos.map(f => f.s).join(' ');
}
