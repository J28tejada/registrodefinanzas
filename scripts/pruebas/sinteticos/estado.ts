/**
 * Un estado de cuenta del Popular INVENTADO, armado fragmento por fragmento
 * en las mismas posiciones que el de verdad.
 *
 * Nada de acá sale de un estado real: el titular, la cuenta, los comercios y
 * los montos son inventados. Lo único copiado es la GEOMETRÍA —dónde cae cada
 * cosa en la página—, que es justo lo que el lector necesita: fechas en x 43 y
 * 81, el detalle en 168 con el primer renglón partido en dos pedazos, los
 * montos alineados a la derecha en 450.5 / 514.5 / 578.7 (y unas décimas
 * corridos en la página 2), el detalle siguiente 9 pt más abajo, un cambio de
 * página, el BALANCE ANTERIOR con el mes en inglés y un gráfico con números
 * debajo de la tabla de la página 1.
 *
 * Los mismos fragmentos sirven para la prueba sin PDF (`extractos.prueba.ts`)
 * y, escritos como PDF por `pdf.ts`, para la de punta a punta.
 */
import type { FragmentoPdf } from '../../../lib/extractos/tipos';

export const TITULAR = 'ANA PRUEBA GOMEZ';
export const CORREO = 'ana.prueba@example.com';
export const CUENTA = '000000123456';
export const IBAN = 'DO12BPDO00000000000000123456';

/**
 * Anchos de Helvetica (por 1000 de cuerpo), los del estándar. El PDF
 * sintético los declara en su /Widths, así pdf.js mide exactamente lo mismo
 * que acá y los bordes derechos coinciden al centésimo.
 */
const ANCHOS: Record<string, number> = {
  ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333,
  '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584,
  '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556, '`': 333,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  Á: 667, É: 667, Í: 278, Ó: 778, Ú: 722, Ñ: 722, á: 556, é: 556, í: 278, ó: 556, ú: 556, ñ: 556,
};
for (let d = 0; d <= 9; d++) ANCHOS[String(d)] = 556;

export function anchoDe(c: string): number {
  const w = ANCHOS[c];
  if (w === undefined) throw new Error(`el estado sintético usa un carácter sin ancho: ${c}`);
  return w;
}

/** Un fragmento con su cuerpo, para que el PDF lo escriba igual. */
export interface FragmentoSintetico extends FragmentoPdf { tam: number }

function ancho(s: string, tam: number): number {
  return ([...s].reduce((suma, c) => suma + anchoDe(c), 0) * tam) / 1000;
}
const r2 = (n: number) => Math.round(n * 1000) / 1000;

/** Alineado a la izquierda, en x. */
function izq(s: string, x: number, y: number, pagina: number, tam = 7.5): FragmentoSintetico {
  return { s, x, y, fin: r2(x + ancho(s, tam)), pagina, tam };
}
/** Alineado a la derecha, terminando en `fin`. */
function der(s: string, fin: number, y: number, pagina: number, tam = 7.5): FragmentoSintetico {
  return { s, x: r2(fin - ancho(s, tam)), y, fin, pagina, tam };
}

/** 123456 → '1,234.56'; con signo si es negativo. */
export function montoImpreso(centavos: number): string {
  const abs = Math.abs(centavos);
  const enteros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}${enteros}.${String(abs % 100).padStart(2, '0')}`;
}

export interface LineaSintetica {
  entrada: string;
  transac: string;
  /**
   * El primer renglón del detalle, en uno o dos pedazos. El primero va en x 168
   * y el segundo 22 pt después de donde termina el primero, como en el real.
   */
  primero: string[];
  /** Los renglones de abajo, cada uno entero en x 168. */
  siguientes?: string[];
  centavos: number;
  /** Lo que se imprime en vez del monto, para probar un signo que no coincide con la columna. */
  impreso?: { texto: string; columna: 'debito' | 'credito' };
}

const D = 168;

/**
 * El estado: corta el 6 de enero de 2027, así las líneas de diciembre son de
 * 2026 (el cambio de año), y abre con '05DEC' en inglés.
 */
export const LINEAS: LineaSintetica[] = [
  { entrada: '08DIC', transac: '08DIC', centavos: 500000,
    primero: ['CAJERO POPULAR SUCURSAL EJEMPLO, SD 123456789012'],
    siguientes: ['654321 DEP ACTE ATM0001'] },
  // El comercio en un pedazo y la ciudad con la referencia en otro.
  { entrada: '09DIC', transac: '08DIC', centavos: -123456,
    primero: ['SUPER EJEMPLO - CENTRO', 'SDO, 111122223333 444555 POS W/D 1'],
    siguientes: ['87654321'] },
  // 'POS W/D' partido: 'PO' al final del renglón y 'W/D' en el siguiente.
  { entrada: '10DIC', transac: '09DIC', centavos: -200000,
    primero: ['GASOLINERA MODELO', 'SDO, 222233334444 555666 PO'],
    siguientes: ['W/D 12 87654321'] },
  { entrada: '10DIC', transac: '10DIC', centavos: -7500, primero: ['CARGO MENSUAL TD CLASICA'] },
  { entrada: '12DIC', transac: '11DIC', centavos: -100000,
    primero: ['CAJERO POPULAR AV PRINCIPAL, 333344445555 777888'],
    siguientes: ['RET DE C K ATM0002'] },
  // Mellizas: −40, +40, −40 el mismo día. La primera y la tercera tienen la
  // misma fecha, el mismo monto y el mismo saldo después: solo las separa la
  // repetición de la clave.
  { entrada: '14DIC', transac: '14DIC', centavos: -4000,
    primero: ['CAJERO POPULAR AV PRINCIPAL, SD 444455556666'], siguientes: ['112233 RET CHK ATM0002'] },
  { entrada: '14DIC', transac: '14DIC', centavos: 4000,
    primero: ['CAJERO POPULAR AV PRINCIPAL, 555566667777 334455'], siguientes: ['DEP CTAC E ATM0002'] },
  { entrada: '14DIC', transac: '14DIC', centavos: -4000,
    primero: ['CAJERO POPULAR AV PRINCIPAL, SD 666677778888'], siguientes: ['445566 RET E CHK ATM0002'] },
  { entrada: '15DIC', transac: '15DIC', centavos: -1050,
    primero: ['PAGO IMPUESTO 0.15% DGII, 3 TRANS POR $ 7,000.00 Del'],
    siguientes: ['14/12/2026 al 14/12/2026'] },
  { entrada: '16DIC', transac: '16DIC', centavos: -300000, primero: ['MB a 0001234567 PEDRO PEREZ'] },
  // ── página 2 ──
  { entrada: '20DIC', transac: '20DIC', centavos: 250000, primero: ['MB desde 009876543 MARIA RODRIGUEZ L'] },
  // El titular recortado y con una referencia pegada.
  { entrada: '22DIC', transac: '21DIC', centavos: -150000, primero: ['TOKE* a ANA PRUEBA G 1a2b3c'] },
  { entrada: '23DIC', transac: '23DIC', centavos: 80000,
    primero: ['LBTR 0004445556 ANA PRUEBA, BANCO EJEMPLO RD$'],
    siguientes: ['B123456.X12345 REF0001112223'] },
  // La compra con número de orden…
  { entrada: '27DIC', transac: '26DIC', centavos: -240000,
    primero: ['TIENDA ONLINE M*12-34567-89012', 'WA, 123412341234'],
    siguientes: ['56789 POS W/D 12 87654321'] },
  // 'OS W/D': pdf.js se comió la P.
  { entrada: '29DIC', transac: '28DIC', centavos: -35000,
    primero: ['PEDIDOSYA*PROPINA DO SD', 'SDO, PEDIDOSYA 999988887777'],
    siguientes: ['123456 OS W/D 12 87654321'] },
  // …y su devolución parcial, con el mismo número de orden y 'OS CR RTN'.
  { entrada: '02ENE', transac: '31DIC', centavos: 60000,
    primero: ['TIENDA ONLINE M*12-34567-89012', '123-, 432143214321'],
    siguientes: ['654321 OS CR RTN 87654321'] },
  // El titular dado vuelta, con coma.
  { entrada: '03ENE', transac: '03ENE', centavos: 100000,
    primero: ['999888777: PRUEBA GOMEZ, ANA RD$', '.00'] },
  { entrada: '04ENE', transac: '04ENE', centavos: -50000, primero: ['Pago ACH BANCO a 0007654321'] },
  { entrada: '05ENE', transac: '04ENE', centavos: -20000,
    primero: ['CAJERO EJEMPLO SUR, 1 LUGAR'], siguientes: ['123456789012 12345 RET DE CHK ATM0003'] },
  { entrada: '06ENE', transac: '06ENE', centavos: -4500, primero: ['BANCASEGURO DIC 2026 RD$', '.00'] },
  // Algo que no se reconoce: queda 'other', nunca se adivina.
  { entrada: '06ENE', transac: '05ENE', centavos: 1000, primero: ['AJUSTE CONTABLE REF 123456789'] },
];

/** En qué línea arranca la página 2. */
export const CORTE_DE_PAGINA = 10;
export const SALDO_ANTERIOR = 1200000;

export interface OpcionesDelEstado {
  lineas?: LineaSintetica[];
  /** Índices de líneas que cuentan para los saldos pero no se imprimen: "el lector se comió una". */
  omitir?: number[];
  /** Pisa números del resumen de arriba. */
  resumen?: Partial<{ anterior: number; creditos: number; nCreditos: number; debitos: number; nDebitos: number; corte: number }>;
}

export interface EstadoSintetico {
  fragmentos: FragmentoSintetico[];
  paginas: number;
  saldoFinal: number;
  creditos: number;
  debitos: number;
}

export function armarEstado(op: OpcionesDelEstado = {}): EstadoSintetico {
  const lineas = op.lineas ?? LINEAS;
  const f: FragmentoSintetico[] = [];

  // Los saldos y los totales salen de las líneas, como en el banco.
  const saldos: number[] = [];
  let saldo = SALDO_ANTERIOR;
  let nCred = 0, nDeb = 0, sCred = 0, sDeb = 0;
  for (const l of lineas) {
    saldo += l.centavos;
    saldos.push(saldo);
    if (l.centavos > 0) { nCred++; sCred += l.centavos; } else { nDeb++; sDeb -= l.centavos; }
  }
  const res = {
    anterior: SALDO_ANTERIOR, creditos: sCred, nCreditos: nCred, debitos: sDeb, nDebitos: nDeb, corte: saldo,
    ...op.resumen,
  };

  // ── Página 1: encabezado, resumen y el título de la tabla ──
  f.push(izq(TITULAR, 68.8, 665.9, 1, 7), izq(CORREO, 68.8, 657.5, 1, 7));
  f.push(der('Pag 1', 579.7, 652.6, 1, 9), der('6 de enero de 2027', 579.7, 641.8, 1, 9));
  f.push(izq('123', 302.3, 604.7, 1), izq('4', 306.9, 595.7, 1));
  f.push(izq('INFORMACIÓN SOBRE SU ESTADO DE CUENTA', 187.1, 492.7, 1, 12));
  f.push(izq('CUENTA DIGITAL LIBRE', 103.4, 477.4, 1), izq(CUENTA, 193.3, 477.4, 1));
  f.push(izq('NÚMERO DE CUENTA REGIONAL', 74.3, 468.4, 1), izq(IBAN, 193.3, 468.4, 1));
  f.push(izq('CANTIDAD', 228.8, 450.7, 1), der('MONTO RD$', 350.2, 450.7, 1));
  f.push(izq('BALANCE ANTERIOR', 39, 440.9, 1), der(montoImpreso(res.anterior), 350.2, 440.9, 1));
  f.push(izq('+ DEPÓSITOS Y OTROS CRÉDITOS', 39, 430.5, 1), der(String(res.nCreditos), 263, 430.5, 1),
    der(montoImpreso(res.creditos), 350.2, 430.5, 1));
  f.push(izq('- CHEQUES Y OTRO DÉBITOS', 39, 420.5, 1), der(String(res.nDebitos), 263, 420.5, 1),
    der(montoImpreso(res.debitos), 350.2, 420.5, 1));
  f.push(izq('+ INTERÉS PAGADO', 39, 410.6, 1), der('0.00', 350.2, 410.6, 1));
  f.push(izq('- INTERÉS CARGADO', 39, 400.4, 1), der('0.00', 350.2, 400.4, 1));
  f.push(izq('BALANCE AL CORTE', 39, 390.7, 1), der(montoImpreso(res.corte), 350.2, 390.7, 1));

  // El título de la tabla, con los bordes de cada página.
  const BORDES: Record<number, { deb: number; cred: number; bal: number; yTitulo: number; detalle: number }> = {
    1: { deb: 450.5, cred: 514.5, bal: 578.7, yTitulo: 368.3, detalle: 260.5 },
    2: { deb: 449.9, cred: 513.8, bal: 578.0, yTitulo: 574.2, detalle: 260.2 },
  };
  const titulo = (p: number) => {
    const b = BORDES[p];
    f.push(izq('FECHAS DE', 58.1, b.yTitulo + 4.4, p, 7), izq('ENTRADA', 38.5, b.yTitulo - 4, p, 7),
      izq('TRANSAC.', 81, b.yTitulo - 4, p, 7));
    f.push(izq('No. DE CHEQUE', 115.3, b.yTitulo, p), izq('DETALLE', b.detalle, b.yTitulo, p),
      der('DÉBITO RD$', b.deb, b.yTitulo, p), der('CRÉDITO RD$', b.cred, b.yTitulo, p),
      der('BALANCE RD$', b.bal, b.yTitulo, p));
  };
  titulo(1);
  // El saldo anterior con el mes en INGLÉS: así lo imprime el banco.
  f.push(izq('05DEC', 43.5, 351.5, 1), izq('BALANCE ANTERIOR', 84.1, 351.5, 1),
    der(montoImpreso(SALDO_ANTERIOR), BORDES[1].bal, 351.5, 1));

  // ── Los movimientos ──
  let pagina = 1;
  let y = 341.6;
  lineas.forEach((l, i) => {
    if (i === CORTE_DE_PAGINA) {
      // Cambio de página: encabezado repetido y el título otra vez, más arriba.
      pagina = 2;
      f.push(der('Pag 2', 579.7, 683.8, 2, 9), der('6 de enero de 2027', 579.7, 673, 2, 9));
      f.push(izq('SU ESTADO DE CUENTA', 305, 597.6, 2, 12));
      titulo(2);
      y = 559.7;
    }
    const b = BORDES[pagina];
    const alto = l.siguientes?.length ? 16.5 : 11;
    if (!op.omitir?.includes(i)) {
      f.push(izq(l.entrada, 43.5, y, pagina), izq(l.transac, 81.5, y, pagina));
      let x = D;
      for (const s of l.primero) {
        const pedazo = izq(s, x, y, pagina);
        f.push(pedazo);
        x = pedazo.fin + 22;
      }
      if (l.impreso) {
        f.push(der(l.impreso.texto, l.impreso.columna === 'debito' ? b.deb : b.cred, y, pagina));
      } else {
        f.push(der(montoImpreso(l.centavos), l.centavos < 0 ? b.deb : b.cred, y, pagina));
      }
      f.push(der(montoImpreso(saldos[i]), b.bal, y, pagina));
      (l.siguientes ?? []).forEach((s, k) => f.push(izq(s, D, y - 9 * (k + 1), pagina)));
    }
    y -= alto + 9 * Math.max(0, (l.siguientes?.length ?? 0) - 1);
  });
  // El cierre: 'BALANCE', 'AL' y 'CORTE' sueltos, y el monto 0.6 pt más abajo.
  f.push(izq('06ENE', 42.9, y, pagina), izq('BALANCE', 72.1, y, pagina), izq('AL', 108.9, y, pagina),
    izq('CORTE', 123.1, y, pagina), der(montoImpreso(saldo), BORDES[pagina].bal, y - 0.6, pagina));

  // ── El gráfico de la página 1, debajo de la tabla: números sin fechas ──
  // Uno cae justo en el borde de los créditos: igual no es un movimiento.
  f.push(izq('Uso de la cuenta', 241.7, 150.8, 1, 8.6), izq('12.50%', 244.6, 140.8, 1, 6.6));
  f.push(izq('Compras/Retiros', 454.8, 150.4, 1, 9));
  f.push(der('25,000.00', BORDES[1].cred, 105.6, 1, 5), izq('10,000.00', 464.9, 82, 1, 5));
  f.push(izq('35.20% Compras', 556.1, 94.6, 1, 6), izq('64.80% Retiros', 556.1, 88.6, 1, 6));

  // ── Pies de página. En la 2 el nombre llega AL FINAL, como lo dibuja el banco ──
  f.push(izq('Servicio al cliente / Telefonos: 809-000-0000 / 1-200-000-0000', 55.4, 20.5, 1, 10));
  f.push(izq('Servicio al cliente / Telefonos: 809-000-0000 / 1-200-000-0000', 55.4, 46, 2, 10));
  f.push(izq(TITULAR, 68.8, 670.4, 2, 7), izq(CORREO, 68.8, 662, 2, 7));

  return { fragmentos: f, paginas: pagina, saldoFinal: saldo, creditos: nCred, debitos: nDeb };
}

/** Lo que tiene que dar leer el estado sin tocar. */
export const ESPERADO = {
  lineas: LINEAS.length,
  creditos: LINEAS.filter(l => l.centavos > 0).length,
  debitos: LINEAS.filter(l => l.centavos < 0).length,
  porClase: {
    purchase: 4, withdrawal: 4, deposit: 2, fee: 3, transfer_out: 2, transfer_in: 1,
    own_transfer: 3, refund: 1, other: 1,
  } as Record<string, number>,
};
