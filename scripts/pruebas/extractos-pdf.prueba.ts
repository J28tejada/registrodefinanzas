/**
 * El lector de punta a punta, pasando por pdf.js de verdad.
 *
 * Es asíncrona (pdf.js lo es), así que exporta `listo` y el corredor la espera.
 * El PDF se arma en memoria con el mismo estado inventado de
 * `extractos.prueba.ts`: si una versión nueva de unpdf cambia cómo mide o
 * corta el texto, esta es la prueba que lo dice.
 */
import { crear } from './aserciones';
import { leerEstadoDeCuenta, TOPES } from '@/lib/extractos/leer';
import { ErrorDeLectura, fragmentosDePdf, traducirErrorDePdf } from '@/lib/extractos/pdf';
import { agruparRenglones } from '@/lib/extractos/renglones';
import { popularCuenta } from '@/lib/extractos/formatos/popular-cuenta';
import { interpretar } from '@/lib/extractos/interpretar';
import { LIMITE_PDF_BYTES } from '@/lib/extractos/textos';
import { armarEstado, ESPERADO, type FragmentoSintetico } from './sinteticos/estado';
import { pdfSintetico } from './sinteticos/pdf';

const t = crear('extractos-pdf');

export const listo = (async () => {
  const estado = armarEstado();
  const bytes = pdfSintetico(estado.fragmentos, estado.paginas);

  // ── Lo que devuelve pdf.js ──
  const { fragmentos, paginas } = await fragmentosDePdf(bytes, { maxPaginas: 20, tiempoMs: 15_000 });
  t.igual('las páginas', paginas, 2);
  const debito = fragmentos.find(f => f.s === 'DÉBITO RD$' && f.pagina === 1);
  t.cierto('la tilde llega bien (WinAnsi con escape octal)', !!debito);
  t.cierto('y con su borde derecho donde va', !!debito && Math.abs(debito.fin - 450.5) < 0.05);
  const fecha = fragmentos.find(f => f.s === '05DEC');
  t.cierto('las fechas en su lugar', !!fecha && Math.abs(fecha.x - 43.5) < 0.01 && Math.abs(fecha.y - 351.5) < 0.01);

  // ── De punta a punta ──
  const r = await leerEstadoDeCuenta(bytes);
  if (!r.ok) {
    t.falla(`el PDF sintético no se leyó: ${JSON.stringify(r)}`);
  } else {
    t.igual('páginas', r.paginas, 2);
    t.igual('líneas, créditos y débitos exactos', r.extracto.conciliacion,
      { lineas: ESPERADO.lineas, creditos: ESPERADO.creditos, debitos: ESPERADO.debitos });
    const porClase: Record<string, number> = {};
    for (const l of r.extracto.lineas) porClase[l.clase] = (porClase[l.clase] ?? 0) + 1;
    for (const [clase, n] of Object.entries(ESPERADO.porClase)) t.igual(`clase ${clase}`, porClase[clase] ?? 0, n);

    // pdf.js pega dos pedazos cuando quedan cerca ('CUENTA DIGITAL LIBRE' con
    // el número, 'BALANCE' con 'AL'): el resultado tiene que ser el mismo que
    // leyendo los fragmentos tal cual se armaron.
    const directo = popularCuenta.leer(agruparRenglones(estado.fragmentos));
    const esperado = 'error' in directo ? directo : interpretar(directo);
    t.igual('lo mismo que sin pasar por el PDF', r.extracto, 'ok' in esperado && esperado.ok ? esperado.extracto : esperado);
  }

  t.igual('no le toca los bytes a quien llama (conSesion puede reintentar)', bytes.length > 0 &&
    (await leerEstadoDeCuenta(bytes)).ok, true);

  // ── Lo que no es un estado ──
  const txt = (s: string) => new TextEncoder().encode(s);
  t.igual('un archivo que no es PDF', await leerEstadoDeCuenta(txt('hola, esto no es un PDF')), { ok: false, codigo: 'NO_ES_PDF' });
  t.igual('un PDF roto', await leerEstadoDeCuenta(txt('%PDF-1.4\nbasura sin objetos\n%%EOF')), { ok: false, codigo: 'NO_ES_PDF' });
  t.igual('más de 3 MB', await leerEstadoDeCuenta(new Uint8Array(LIMITE_PDF_BYTES + 1)), { ok: false, codigo: 'MUY_GRANDE' });
  t.igual('un escaneo sin texto', await leerEstadoDeCuenta(pdfSintetico([], 1)), { ok: false, codigo: 'SIN_TEXTO' });
  t.igual('demasiadas páginas', await leerEstadoDeCuenta(pdfSintetico([], TOPES.paginas + 1)), { ok: false, codigo: 'MUY_LARGO' });
  const factura: FragmentoSintetico[] = [
    { s: 'FACTURA', x: 50, y: 700, fin: 90, pagina: 1, tam: 7.5 },
    { s: 'Total 1,000.00', x: 50, y: 680, fin: 100, pagina: 1, tam: 7.5 },
  ];
  t.igual('otro documento', await leerEstadoDeCuenta(pdfSintetico(factura, 1)), { ok: false, codigo: 'FORMATO_DESCONOCIDO' });
  const comida = armarEstado({ omitir: [3] });
  t.igual('si no cuadra, dice qué y dónde, y no devuelve líneas',
    await leerEstadoDeCuenta(pdfSintetico(comida.fragmentos, comida.paginas)),
    { ok: false, codigo: 'NO_CUADRA', motivo: 'saldo', fecha: '2026-12-12' });

  // ── El tiempo ──
  const largo = pdfSintetico(
    Array.from({ length: 20 }, (_, p) => estado.fragmentos.map(f => ({ ...f, pagina: p + 1 }))).flat(), 20);
  const vencido: unknown = await fragmentosDePdf(largo, { maxPaginas: 20, tiempoMs: 1 }).then(() => 'terminó', e => e);
  t.cierto('pasado el tiempo se corta, con un código y sin el mensaje de pdf.js',
    vencido instanceof ErrorDeLectura && vencido.codigo === 'ILEGIBLE');
  t.igual('y con tiempo, el mismo PDF se lee', (await fragmentosDePdf(largo, { maxPaginas: 20, tiempoMs: 15_000 })).paginas, 20);

  // ── Los errores de pdf.js, traducidos ──
  t.igual('sin contraseña', traducirErrorDePdf({ name: 'PasswordException', code: 1, message: 'No password given' }), 'CLAVE_REQUERIDA');
  t.igual('contraseña mal', traducirErrorDePdf({ name: 'PasswordException', code: 2, message: 'Incorrect Password' }), 'CLAVE_INCORRECTA');
  t.igual('no es PDF', traducirErrorDePdf({ name: 'InvalidPDFException', message: 'Invalid PDF structure.' }), 'NO_ES_PDF');
  t.igual('cualquier otra cosa', traducirErrorDePdf(new Error('algo de adentro del PDF')), 'ILEGIBLE');
  t.igual('ni siquiera un error', traducirErrorDePdf(undefined), 'ILEGIBLE');
  t.igual('los propios pasan con su código', traducirErrorDePdf(new ErrorDeLectura('MUY_LARGO')), 'MUY_LARGO');

  t.resumen();
})();
