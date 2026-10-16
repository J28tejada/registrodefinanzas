/**
 * El estado de cuenta de ahorro o corriente del Banco Popular, leído por
 * posición.
 *
 * pdf.js no sabe de tablas: devuelve texto con coordenadas. Este lector se
 * apoya en lo que el banco no cambia de una página a otra:
 *
 * - Las columnas de plata están alineadas a la derecha bajo sus títulos
 *   (DÉBITO RD$, CRÉDITO RD$, BALANCE RD$): un monto es de la columna cuyo
 *   borde derecho le queda más cerca. Los bordes se toman de CADA página,
 *   porque se corren unas décimas entre la 1 y las demás.
 * - Un movimiento abre con dos fechas a la izquierda (ENTRADA y TRANSAC.) y
 *   tiene monto. Los números del gráfico de la página 1 no tienen fechas.
 * - El detalle sigue en los renglones de abajo (9 pt más abajo), sin fechas ni
 *   montos, dentro de la columna del detalle.
 * - El resumen de arriba de la página 1 se lee por sus etiquetas.
 *
 * El signo del monto tiene que coincidir con su columna. Si no coincide, o si
 * un renglón trae dos montos, la línea sale con monto 0: el lector no adivina
 * cuál es, y `conciliar` la frena con el motivo 'signo' y su fecha.
 */
import { REGLAS_POPULAR } from '../clasificar';
import { FECHA_CORTA, fechaCorta, fechaLarga } from '../fechas';
import { aCentavos, MONTO } from '../montos';
import { textoDe } from '../renglones';
import type { FragmentoPdf, LecturaCruda, LineaCruda, RenglonPdf, ResumenDelBanco } from '../tipos';
import type { FormatoDeExtracto } from './index';

/**
 * Cuánto puede separarse un monto del borde de su columna. En el estado real
 * coinciden a la décima; los números del gráfico de la página 1 quedan a 9 pt
 * o más de cualquier borde.
 */
const TOLERANCIA_COLUMNA = 5;
/** Un renglón de continuación está 9 pt más abajo; el movimiento siguiente, 16. */
const DISTANCIA_CONTINUACION = 12;

interface Columnas {
  debito: number;
  credito: number;
  balance: number;
  /** Desde dónde empieza el detalle: a la izquierda quedan las fechas y el número de cheque. */
  xDetalle: number;
  /** Dónde empieza la columna de débitos: el detalle no llega hasta acá. */
  xMontos: number;
  moneda: 'DOP' | 'USD';
}

type Columna = 'debito' | 'credito' | 'balance';

/** Si el renglón es el título de la tabla, sus columnas. */
function columnasDe(r: RenglonPdf): Columnas | null {
  const busca = (re: RegExp) => r.fragmentos.find(f => re.test(f.s));
  const debito = busca(/^D[ÉE]BITO\b/);
  const credito = busca(/^CR[ÉE]DITO\b/);
  const balance = busca(/^BALANCE\b/);
  const detalle = busca(/^DETALLE\b/);
  if (!debito || !credito || !balance || !detalle) return null;
  const moneda = /US\$/.test(debito.s) ? 'USD' : /RD\$/.test(debito.s) ? 'DOP' : null;
  if (!moneda) return null;
  return {
    debito: debito.fin,
    credito: credito.fin,
    balance: balance.fin,
    // El título DETALLE va centrado sobre una columna ancha: el texto arranca
    // unos 92 pt antes. Con 100 queda margen y no alcanza al número de cheque.
    xDetalle: detalle.x - 100,
    xMontos: debito.x,
    moneda,
  };
}

function columnaDe(f: FragmentoPdf, c: Columnas): Columna | null {
  if (!MONTO.test(f.s)) return null;
  const candidatas: [Columna, number][] = [
    ['debito', Math.abs(c.debito - f.fin)],
    ['credito', Math.abs(c.credito - f.fin)],
    ['balance', Math.abs(c.balance - f.fin)],
  ];
  candidatas.sort((a, b) => a[1] - b[1]);
  return candidatas[0][1] <= TOLERANCIA_COLUMNA ? candidatas[0][0] : null;
}

/** Las fechas 'DDMMM' a la izquierda del detalle, en orden. */
function fechasDe(r: RenglonPdf, c: Columnas): string[] {
  return r.fragmentos
    .filter(f => f.x < c.xDetalle)
    .flatMap(f => f.s.split(/\s+/))
    .filter(t => FECHA_CORTA.test(t));
}

/** El monto de una fila especial (BALANCE ANTERIOR, BALANCE AL CORTE): el de la columna de balance. */
function balanceDe(r: RenglonPdf, c: Columnas): number | null {
  const f = r.fragmentos.find(x => columnaDe(x, c) === 'balance');
  return f ? aCentavos(f.s) : null;
}

/** Los datos de arriba de la tabla en la página 1: resumen, cuenta, titular, corte. */
interface Encabezado {
  corte: string | null;
  producto: string;
  ultimos4: string | null;
  titular: string;
  resumen: Partial<ResumenDelBanco>;
}

/** Palabras de la plantilla que no pueden ser el nombre del titular. */
const NO_ES_NOMBRE = /\b(CUENTA|ESTADO|BALANCE|BANCO|POPULAR|PAG|INFORMACI[OÓ]N|RESUMEN|DETALLE|FECHAS?|ENTRADA|TRANSAC)\b/i;

function leerEncabezado(renglones: RenglonPdf[]): Encabezado {
  const e: Encabezado = { corte: null, producto: '', ultimos4: null, titular: '', resumen: {} };
  let ibanUltimos4: string | null = null;

  for (const r of renglones) {
    const t = textoDe(r);

    if (!e.corte) e.corte = fechaLarga(t);

    // El titular: el primer renglón de arriba que es solo un nombre en
    // mayúsculas (2 a 6 palabras). Está antes que el correo y que la fecha.
    if (!e.titular && r.fragmentos[0].x < 300 &&
        /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'.-]*(?:,?\s+[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ'.-]*){1,5}$/.test(t) &&
        !NO_ES_NOMBRE.test(t)) {
      e.titular = t;
    }

    // La cuenta: un número de 6 a 20 dígitos en el mismo renglón que el nombre
    // del producto ('CUENTA DIGITAL LIBRE   123456789'). Se busca en el TEXTO
    // del renglón y no por fragmento, porque pdf.js pega dos pedazos cuando
    // quedan cerca. Solo se guardan los últimos 4.
    const cuenta = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]*[A-ZÁÉÍÓÚÑ])\s+(\d{6,20})$/.exec(t);
    if (!e.ultimos4 && cuenta) {
      e.ultimos4 = cuenta[2].slice(-4);
      e.producto = cuenta[1].replace(/\s+/g, ' ');
    }
    // El IBAN, por si el número de cuenta no aparece suelto. Puede llegar pegado
    // a su etiqueta ('…REGIONALDO12BPDO…'), así que no se ancla al principio.
    const iban = /([A-Z]{2}\d{2}[A-Z]{4}\d{8,})\b/.exec(t);
    if (iban && !ibanUltimos4) ibanUltimos4 = iban[1].slice(-4);

    // El resumen, por sus etiquetas: el monto es lo último del renglón y la
    // cantidad, si la hay, el entero de antes. Por palabras y no por
    // fragmento, por si pdf.js pega la cantidad a la etiqueta.
    const palabras = t.split(/\s+/);
    const monto = aCentavos(palabras[palabras.length - 1] ?? '');
    if (monto === null) continue;
    const cantidad = palabras[palabras.length - 2] ?? '';
    const n = /^\d{1,5}$/.test(cantidad) ? Number(cantidad) : null;
    if (/^BALANCE\s+ANTERIOR\b/.test(t)) e.resumen.saldoAnteriorCentavos = monto;
    else if (/DEP[ÓO]SITOS/.test(t) && n !== null) e.resumen.creditos = { n, centavos: monto };
    else if (/CHEQUES|D[ÉE]BITOS/.test(t) && n !== null) e.resumen.debitos = { n, centavos: monto };
    else if (/INTER[ÉE]S\s+PAGADO/.test(t)) e.resumen.interesPagadoCentavos = monto;
    else if (/INTER[ÉE]S\s+CARGADO/.test(t)) e.resumen.interesCargadoCentavos = monto;
    else if (/^BALANCE\s+AL\s+CORTE\b/.test(t)) e.resumen.saldoAlCorteCentavos = monto;
  }

  if (!e.ultimos4 && ibanUltimos4) e.ultimos4 = ibanUltimos4;
  return e;
}

function resumenCompleto(r: Partial<ResumenDelBanco>): ResumenDelBanco | null {
  if (r.saldoAnteriorCentavos === undefined || !r.creditos || !r.debitos ||
      r.saldoAlCorteCentavos === undefined) return null;
  return {
    saldoAnteriorCentavos: r.saldoAnteriorCentavos,
    creditos: r.creditos,
    debitos: r.debitos,
    // La plantilla siempre los imprime, aunque en cero. Si faltan, no se
    // inventa nada: los totales igual tienen que cuadrar.
    interesPagadoCentavos: r.interesPagadoCentavos ?? 0,
    interesCargadoCentavos: r.interesCargadoCentavos ?? 0,
    saldoAlCorteCentavos: r.saldoAlCorteCentavos,
  };
}

/** Un movimiento a medio armar: la línea más la altura del último renglón que se le pegó. */
interface EnCurso { linea: LineaCruda; yUltimo: number }

function abrirMovimiento(r: RenglonPdf, c: Columnas, fechas: string[], corte: string): LineaCruda {
  const debitos: FragmentoPdf[] = [];
  const creditos: FragmentoPdf[] = [];
  const balances: FragmentoPdf[] = [];
  const detalle: string[] = [];
  for (const f of r.fragmentos) {
    const col = columnaDe(f, c);
    if (col === 'debito') debitos.push(f);
    else if (col === 'credito') creditos.push(f);
    else if (col === 'balance') balances.push(f);
    else if (f.x >= c.xDetalle) detalle.push(f.s);
  }

  // Exactamente un monto, y con el signo de su columna. Si no, 0: no se adivina.
  let centavos = 0;
  if (debitos.length + creditos.length === 1) {
    const valor = aCentavos((debitos[0] ?? creditos[0]).s) ?? 0;
    if (debitos.length === 1 && valor < 0) centavos = valor;
    if (creditos.length === 1 && valor > 0) centavos = valor;
  }
  // Sin un balance legible la cadena se corta justo en esta línea: NaN no es
  // igual a nada, y `conciliar` dice 'saldo' con esta fecha.
  const saldo = balances.length === 1 ? aCentavos(balances[0].s) : null;

  return {
    asentada: fechaCorta(fechas[0], corte) ?? '',
    fecha: fechaCorta(fechas[1], corte) ?? '',
    detalle,
    centavos,
    saldoCentavos: saldo ?? Number.NaN,
    pagina: r.pagina,
  };
}

export const popularCuenta: FormatoDeExtracto = {
  id: 'popular-cuenta',
  banco: 'popular',
  reglas: REGLAS_POPULAR,

  reconoce(renglones) {
    if (!renglones.some(r => columnasDe(r))) return false;
    const textos = renglones.map(textoDe);
    return textos.some(t => /BALANCE\s+AL\s+CORTE/.test(t)) &&
      // El código del banco en el IBAN, o el nombre.
      textos.some(t => /BPDO/.test(t) || /\bPOPULAR\b/i.test(t));
  },

  leer(renglones) {
    const titulo = renglones.find(r => columnasDe(r));
    if (!titulo) return { error: 'FORMATO_DESCONOCIDO' };

    // Todo lo de arriba de la tabla de la página 1: el encabezado y el resumen.
    const arriba = renglones.filter(r => r.pagina === titulo.pagina && r.y > titulo.y);
    const enc = leerEncabezado(arriba);
    const resumen = resumenCompleto(enc.resumen);
    if (!enc.corte || !enc.ultimos4 || !resumen) return { error: 'FORMATO_DESCONOCIDO' };
    const corte = enc.corte;

    let columnas: Columnas | null = null;
    let saldoInicial: number | null = null;
    let saldoFinal: number | null = null;
    const lineas: LineaCruda[] = [];
    let enCurso: EnCurso | null = null;
    let pagina = 0;

    for (const r of renglones) {
      if (r.pagina !== pagina) { pagina = r.pagina; enCurso = null; }
      const propias = columnasDe(r);
      if (propias) { columnas = propias; enCurso = null; continue; }
      // Antes del primer título no hay tabla.
      if (!columnas) continue;

      const fechas = fechasDe(r, columnas);
      const t = textoDe(r);

      if (fechas.length >= 1 && /BALANCE\s+ANTERIOR/.test(t)) {
        if (saldoInicial === null) saldoInicial = balanceDe(r, columnas);
        enCurso = null;
        continue;
      }
      if (fechas.length >= 1 && /BALANCE\s+AL\s+CORTE/.test(t)) {
        saldoFinal = balanceDe(r, columnas);
        enCurso = null;
        continue;
      }
      if (fechas.length === 2) {
        const linea = abrirMovimiento(r, columnas, fechas, corte);
        lineas.push(linea);
        enCurso = { linea, yUltimo: r.y };
        continue;
      }

      // ¿Sigue el detalle del movimiento de arriba?
      const c = columnas;
      const debajo = enCurso ? enCurso.yUltimo - r.y : -1;
      if (enCurso && fechas.length === 0 && debajo > 0 && debajo < DISTANCIA_CONTINUACION &&
          r.fragmentos.every(f => f.x >= c.xDetalle && f.x < c.xMontos && !columnaDe(f, c))) {
        enCurso.linea.detalle.push(t);
        enCurso.yUltimo = r.y;
        continue;
      }
      enCurso = null;
    }

    if (saldoInicial === null || saldoFinal === null || !columnas) return { error: 'FORMATO_DESCONOCIDO' };

    const producto = enc.producto || 'CUENTA';
    return {
      formato: 'popular-cuenta',
      banco: 'popular',
      producto,
      // Corriente si el producto lo dice; si no, ahorro, que es lo que vende el
      // Popular a una persona ('CUENTA DIGITAL LIBRE').
      tipoDeCuenta: /CORRIENTE|CHEQUE/i.test(producto) ? 'checking' : 'savings',
      moneda: columnas.moneda,
      ultimos4: enc.ultimos4,
      titular: enc.titular,
      corte,
      saldoInicialCentavos: saldoInicial,
      saldoFinalCentavos: saldoFinal,
      resumen,
      lineas,
    };
  },
};
