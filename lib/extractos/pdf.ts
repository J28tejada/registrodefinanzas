/**
 * SOLO SERVIDOR. Del PDF a fragmentos de texto con su posición.
 *
 * Es, con `leer.ts`, el único archivo de `lib/extractos/` que importa unpdf
 * (pdf.js por dentro), igual que `lib/gmail.ts` es el único que importa
 * googleapis. El teléfono no puede correr pdf.js —Hermes no tiene lo que
 * necesita y Metro ni lo resuelve—, así que le manda el PDF a la web. Si algo
 * del teléfono importara este archivo, `expo export` dejaría de compilar.
 *
 * unpdf va fijo en 1.8.1: el lector depende de la geometría exacta del texto,
 * y la prueba de punta a punta con un PDF sintético es la que avisa si una
 * versión nueva la cambia.
 */
import { getDocumentProxy } from 'unpdf';
import type { CodigoDeLectura, FragmentoPdf } from './tipos';

/** Un fallo con su código ya decidido: no lleva el mensaje de pdf.js. */
export class ErrorDeLectura extends Error {
  constructor(readonly codigo: CodigoDeLectura) {
    super(codigo);
    this.name = 'ErrorDeLectura';
  }
}

/** '%PDF-' en los primeros 1024 bytes, que es donde lo admite el estándar. */
function pareceUnPdf(bytes: Uint8Array): boolean {
  const firma = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const hasta = Math.min(bytes.length - firma.length, 1024);
  for (let i = 0; i <= hasta; i++) {
    if (firma.every((b, k) => bytes[i + k] === b)) return true;
  }
  return false;
}

/**
 * El error de pdf.js traducido a un código. Nunca se vuelve a tirar el error
 * original: `conSesion` registra lo que se tira tal cual, y el mensaje de pdf.js
 * puede traer partes del documento.
 */
export function traducirErrorDePdf(err: unknown): CodigoDeLectura {
  if (err instanceof ErrorDeLectura) return err.codigo;
  const e = (err ?? {}) as { name?: unknown; code?: unknown };
  if (e.name === 'PasswordException') {
    // pdf.js: 1 = NEED_PASSWORD, 2 = INCORRECT_PASSWORD.
    return e.code === 2 ? 'CLAVE_INCORRECTA' : 'CLAVE_REQUERIDA';
  }
  if (e.name === 'InvalidPDFException') return 'NO_ES_PDF';
  return 'ILEGIBLE';
}

/** El documento abierto, con el tipo que declara unpdf. */
type Documento = Awaited<ReturnType<typeof getDocumentProxy>>;

/**
 * Cerrar el documento libera lo que pdf.js tiene tomado. En pdf.js 6 se cierra
 * desde la tarea que lo abrió: el documento ya no trae su propio `destroy`.
 */
function cerrar(doc: Documento): Promise<void> {
  return doc.loadingTask.destroy().catch(() => {});
}

interface ItemDeTexto { str: string; transform: number[]; width: number }

function esItemDeTexto(i: unknown): i is ItemDeTexto {
  const x = i as Partial<ItemDeTexto> | null;
  return !!x && typeof x.str === 'string' && Array.isArray(x.transform) && typeof x.width === 'number';
}

/**
 * Todos los fragmentos con texto, página por página.
 *
 * Tira `ErrorDeLectura` (o lo que tire pdf.js): quien llama lo pasa por
 * `traducirErrorDePdf`.
 */
export async function fragmentosDePdf(
  bytes: Uint8Array,
  op: { clave?: string; maxPaginas: number; tiempoMs: number },
): Promise<{ fragmentos: FragmentoPdf[]; paginas: number }> {
  if (!pareceUnPdf(bytes)) throw new ErrorDeLectura('NO_ES_PDF');

  let doc: Documento | null = null;
  let vencido = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const leer = async () => {
    // Una copia: pdf.js puede quedarse con el buffer que recibe, y `conSesion`
    // vuelve a correr esto si el token llegó con el reloj corrido.
    const abierto = await getDocumentProxy(bytes.slice(), {
      ...(op.clave ? { password: op.clave } : {}),
      // Sin esto pdf.js escribe avisos ('Indexing all PDF objects') en la
      // consola del servidor, que es el log de Vercel. No va `isEvalSupported`:
      // el pdf.js 6 que trae unpdf 1.8.1 ya no tiene ese camino (ni la opción).
      verbosity: 0,
    });
    // Si el tiempo ya se venció mientras abría, se cierra y no se lee nada.
    if (vencido) { await cerrar(abierto); throw new ErrorDeLectura('ILEGIBLE'); }
    doc = abierto;

    if (abierto.numPages > op.maxPaginas) throw new ErrorDeLectura('MUY_LARGO');

    const fragmentos: FragmentoPdf[] = [];
    for (let p = 1; p <= abierto.numPages; p++) {
      // Sin worker, pdf.js hace todo en microtareas y el reloj del tope no
      // llega a sonar hasta que termina: un PDF pesado se comería la función
      // entera. Cederle el turno al reloj entre página y página lo deja cortar.
      await new Promise(seguir => setTimeout(seguir, 0));
      if (vencido) throw new ErrorDeLectura('ILEGIBLE');
      const { items } = await (await abierto.getPage(p)).getTextContent();
      for (const it of items) {
        if (!esItemDeTexto(it)) continue;
        const s = it.str.normalize('NFC').trim();
        if (!s) continue;
        const x = it.transform[4];
        fragmentos.push({ s, x, y: it.transform[5], fin: x + it.width, pagina: p });
      }
    }
    return { fragmentos, paginas: abierto.numPages };
  };

  const tope = new Promise<never>((_, falla) => {
    reloj = setTimeout(() => {
      vencido = true;
      falla(new ErrorDeLectura('ILEGIBLE'));
    }, op.tiempoMs);
  });

  try {
    return await Promise.race([leer(), tope]);
  } finally {
    if (reloj) clearTimeout(reloj);
    const abierto = doc as Documento | null;
    if (abierto) await cerrar(abierto);
  }
}
