/**
 * Un escritor de PDF mínimo, para que la prueba de punta a punta pase por
 * pdf.js de verdad sin que el repo tenga un solo PDF (y este repo es público).
 *
 * Helvetica con WinAnsi y sus anchos declarados en /Widths: así pdf.js mide
 * cada fragmento exactamente como `estado.ts`, y los bordes derechos de los
 * montos caen donde el lector los espera. Las letras con tilde van como escape
 * octal ('D\311BITO'): el contenido de la página es ASCII y los desplazamientos
 * del xref se cuentan en caracteres sin miedo.
 */
import { anchoDe, type FragmentoSintetico } from './estado';

/** El código WinAnsi de un carácter: para Latin-1 coincide con Unicode. */
function codigo(c: string): number {
  const n = c.charCodeAt(0);
  if (n > 0xff) throw new Error(`fuera de WinAnsi: ${c}`);
  return n;
}

function cadena(s: string): string {
  let out = '';
  for (const c of s) {
    const n = codigo(c);
    if (c === '\\' || c === '(' || c === ')') out += '\\' + c;
    else if (n < 0x20 || n > 0x7e) out += '\\' + n.toString(8).padStart(3, '0');
    else out += c;
  }
  return `(${out})`;
}

function anchos(): string {
  const w: number[] = [];
  for (let n = 32; n <= 255; n++) {
    try { w.push(anchoDe(String.fromCharCode(n))); } catch { w.push(0); }
  }
  return `[${w.join(' ')}]`;
}

/**
 * Arma el PDF: una página por número de página de los fragmentos (las que no
 * tengan ninguno salen en blanco), de 612 × 792 como el carta del banco.
 */
export function pdfSintetico(fragmentos: FragmentoSintetico[], paginas: number): Uint8Array {
  const objetos: string[] = [];
  const nuevo = (contenido: string) => { objetos.push(contenido); return objetos.length; };

  const catalogo = nuevo('');
  const arbol = nuevo('');
  const fuente = nuevo(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding ` +
    `/FirstChar 32 /LastChar 255 /Widths ${anchos()} >>`,
  );

  const hojas: number[] = [];
  for (let p = 1; p <= paginas; p++) {
    const texto = fragmentos
      .filter(f => f.pagina === p)
      .map(f => `BT /F1 ${f.tam} Tf ${f.x} ${f.y} Td ${cadena(f.s)} Tj ET`)
      .join('\n');
    const flujo = nuevo(`<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`);
    hojas.push(nuevo(
      `<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 612 792] /Contents ${flujo} 0 R ` +
      `/Resources << /Font << /F1 ${fuente} 0 R >> >> >>`,
    ));
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
  objetos[arbol - 1] = `<< /Type /Pages /Kids [${hojas.map(h => `${h} 0 R`).join(' ')}] /Count ${hojas.length} >>`;

  let out = '%PDF-1.4\n';
  const posiciones: number[] = [];
  objetos.forEach((o, i) => {
    posiciones.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  out += posiciones.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
