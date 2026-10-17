/**
 * Los especímenes de la galería de componentes.
 *
 * Existe para una sola cosa: que la app web y la de Expo dibujen EXACTAMENTE lo
 * mismo, con los mismos datos, y que `scripts/comparar-galeria.mjs` pueda
 * fotografiar las dos y restarlas píxel por píxel.
 *
 * Los datos viven acá, compartidos, y no duplicados en cada galería: si cada
 * lado tuviera los suyos, una diferencia en los datos se leería como una
 * diferencia de dibujo y la comparación dejaría de significar nada.
 *
 * Cada pieza se envuelve del otro lado en un contenedor con su `id`, que es lo
 * que el comparador busca para recortar la captura.
 */
import {
  BudgetProgress, Card, CardBalance, CardPayment, Category, Transaction, TransactionType,
} from './types';
import type {
  ClaseDeLinea, ContextoDeExtracto, ExtractoLeido, LineaDeExtracto, MovimientoCandidato,
} from './extractos/tipos';
import {
  HojaDeLinea, ResumenDeVista, SeccionDeVista, VistaDelPlan, aplicarCambio, hojaDeLinea,
  planearImportacion, vistaDelPlan,
} from './extractos/planear';

export interface Pieza {
  /** El identificador que busca el comparador. Sin espacios ni acentos. */
  id: string;
  /** Lo que se lee arriba de la pieza en la galería. */
  titulo: string;
  /**
   * Ancho fijo en píxeles: las dos capturas tienen que medir lo mismo.
   *
   * De acá sale también el tamaño de ventana con el que el comparador la
   * fotografía, que nunca llega a los 640 donde Tailwind activa los `sm:`. Ver
   * `scripts/comparar-galeria.mjs`.
   */
  ancho: number;
}

export const ANCHO_POR_DEFECTO = 320;

export const RESUMENES: (Pieza & { income: number; expenses: number; balance: number })[] = [
  { id: 'resumen-mes', titulo: 'Resumen del mes', ancho: 361,
    income: 24700, expenses: 16921, balance: 7779 },
  // En negativo cambia el color y aparece el signo: es la otra mitad de la pieza.
  { id: 'resumen-negativo', titulo: 'Resumen del mes · en negativo', ancho: 361,
    income: 13721, expenses: 16921, balance: -3200 },
];

const presupuesto = (
  id: string, category: string, spent: number, amount: number,
): Pieza & { budget: BudgetProgress } => {
  const percent = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  return {
    id, titulo: `Presupuesto · ${category}`, ancho: ANCHO_POR_DEFECTO,
    budget: {
      id, ledger_id: null, category, amount, created_at: '2026-01-01',
      spent, remaining: amount - spent, percent, ledger_name: null, compartido: false,
    },
  };
};

// Los tres tramos del semáforo: verde, ámbar al 80% y rojo al pasarse.
export const PRESUPUESTOS = [
  presupuesto('presupuesto-verde', 'Alimentación', 3200, 8000),
  presupuesto('presupuesto-ambar', 'Transporte', 5400, 6500),
  presupuesto('presupuesto-rojo', 'Internet celular', 2475, 1715),
];

export const ICONOS: (Pieza & {
  icon: string | null; color: string | null; type: TransactionType;
  size: 'sm' | 'md' | 'lg';
})[] = [
  { id: 'icono-md', titulo: 'Ícono · mediano', ancho: 64, icon: 'utensilios', color: 'orange', type: 'expense', size: 'md' },
  { id: 'icono-sm', titulo: 'Ícono · chico', ancho: 64, icon: 'auto', color: 'blue', type: 'expense', size: 'sm' },
  { id: 'icono-lg', titulo: 'Ícono · grande', ancho: 64, icon: 'billetes', color: 'green', type: 'income', size: 'lg' },
  // Sin ícono ni color: tiene que caer en la etiqueta genérica y el gris del tipo.
  { id: 'icono-generico', titulo: 'Ícono · sin elegir', ancho: 64, icon: null, color: null, type: 'expense', size: 'md' },
  // Una clave que no existe: mismo respaldo que la anterior.
  { id: 'icono-invalido', titulo: 'Ícono · clave inventada', ancho: 64, icon: 'dragon', color: null, type: 'income', size: 'md' },
];

const mov = (
  id: string, campos: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'category'>,
): Transaction => ({
  id, ledger_id: null, scope: 'personal', description: '', date: '2026-09-18',
  createdAt: '2026-09-18T12:00:00Z', source: 'manual', receipt_url: null,
  payment_method: null, card_id: null, author_id: null, author_name: null,
  subcategory: null, ...campos,
});

/**
 * Los movimientos de la galería.
 *
 * Cada uno existe por una fila distinta de la lista: uno sin descripción, uno
 * con subcategoría, uno cargado por otra persona, uno con recibo. Puestos todos
 * juntos en una sola pieza, una diferencia de alto en cualquiera se lee en el
 * total.
 */
export const MOVIMIENTOS: (Pieza & { transactions: Transaction[] })[] = [
  {
    id: 'movimientos-lista', titulo: 'Movimientos · la lista (ancho de teléfono)', ancho: 361,
    transactions: [
      mov('m1', { type: 'expense', amount: 1250, category: 'Alimentación',
        subcategory: 'Supermercado', description: 'Compra del mes' }),
      // Sin descripción: el título lo pone la categoría.
      mov('m2', { type: 'expense', amount: 600, category: 'Combustible' }),
      mov('m3', { type: 'income', amount: 24700, category: 'Salario',
        subcategory: 'Sueldo', description: 'Quincena' }),
      // Cargado por otra persona de una cuenta compartida.
      mov('m4', { type: 'expense', amount: 3200, category: 'Hogar',
        description: 'Pago Rosaura', author_id: 'otra', author_name: 'Rosaura' }),
      // Con medio de pago y llegado por WhatsApp.
      mov('m5', { type: 'expense', amount: 450, category: 'Transporte',
        description: 'Uber', payment_method: 'Visa Popular', source: 'whatsapp' }),
      // Con recibo adjunto, dictado por voz.
      mov('m6', { type: 'expense', amount: 890, category: 'Salud',
        description: 'Farmacia', receipt_url: 'r/1.jpg', source: 'voice' }),
    ],
  },
  { id: 'movimientos-vacio', titulo: 'Movimientos · sin ninguno', ancho: 361, transactions: [] },
];

/**
 * La misma lista, más ancha.
 *
 * Está para separar dos causas que se confunden. A 361px —el ancho real de la
 * lista en un teléfono— la fila difiere bastante, pero a 560 baja a menos del
 * 1%: o sea que lo que falla no es la estructura sino CÓMO ENVUELVE la línea de
 * datos cuando no entra. El navegador y Yoga cortan en lugares distintos.
 *
 * Sin esta segunda medida, el número de la primera parecería un problema de
 * diseño y se arreglaría en el lugar equivocado.
 */
export const MOVIMIENTOS_ANCHO = MOVIMIENTOS.slice(0, 1).map(p => ({
  ...p, id: 'movimientos-lista-ancha', titulo: 'Movimientos · la lista (sin envolver)',
  ancho: 560,
}));

/**
 * El estado de cuenta de una tarjeta de crédito, en sus tres estados.
 *
 * Es la pieza más grande de la app —barra de cupo, las dos fechas del ciclo, lo
 * facturado contra lo del ciclo, el historial de pagos— y la que más formas
 * distintas toma según lo que esté configurado. Los tres especímenes son
 * justamente esas ramas: la tarjeta completa, la que todavía no tiene límite ni
 * ciclo cargados, y la que está a dos días del vencimiento —que pinta las dos
 * fechas de ámbar—.
 */
const tarjeta = (campos: Partial<Card>): Card => ({
  id: 'tarjeta-1', name: 'Visa Popular', kind: 'credit', last4: '4821',
  issuer: 'Banco Popular', color: 'blue', archived: false,
  credit_limit: 80000, statement_day: 25, due_day: 10,
  opening_balance: 0, opening_date: null, alerts: true,
  created_at: '2026-01-01T00:00:00Z', ...campos,
});

const saldo = (campos: Partial<CardBalance>): CardBalance => ({
  charged: 42350, credited: 0, paid: 12000, saldo: 30350,
  cycleCharged: 8420, aPagar: 21930,
  disponible: 49650, usoDelLimite: 37.9375,
  ciclo: {
    lastStatement: '2026-08-25', nextStatement: '2026-09-25',
    nextDue: '2026-10-10', daysToStatement: 7, daysToDue: 22,
  },
  ...campos,
});

const PAGOS: CardPayment[] = [
  { id: 'p1', card_id: 'tarjeta-1', amount: 12000, date: '2026-09-08',
    source_card_id: 'ahorros', notes: '', created_at: '2026-09-08T12:00:00Z' },
  { id: 'p2', card_id: 'tarjeta-1', amount: 9500, date: '2026-08-11',
    source_card_id: null, notes: '', created_at: '2026-08-11T12:00:00Z' },
];

export const ESTADOS_DE_CUENTA: (Pieza & {
  card: Card; balance: CardBalance; payments: CardPayment[];
  mediosDePago: { id: string; name: string }[];
})[] = [
  {
    id: 'tarjeta-estado', titulo: 'Tarjeta · estado de cuenta', ancho: 361,
    card: tarjeta({}), balance: saldo({}), payments: PAGOS,
    mediosDePago: [{ id: 'ahorros', name: 'Ahorros BHD' }, { id: 'efectivo', name: 'Efectivo' }],
  },
  {
    // Sin límite ni ciclo: donde van la barra y las fechas quedan los dos
    // textos que explican cómo cargarlos, más el recuadro del saldo automático.
    id: 'tarjeta-sin-configurar', titulo: 'Tarjeta · recién cargada', ancho: 361,
    card: tarjeta({ credit_limit: null, statement_day: null, due_day: null }),
    balance: saldo({
      charged: 3400, paid: 0, saldo: 3400, cycleCharged: 0, aPagar: 3400,
      disponible: null, usoDelLimite: null, ciclo: null,
    }),
    payments: [], mediosDePago: [],
  },
  {
    // Pasada de cupo y a dos días del pago: la barra en rojo y la fecha en
    // ámbar, que son los dos avisos que la pieza sabe dar.
    id: 'tarjeta-vencida', titulo: 'Tarjeta · pasada de cupo', ancho: 361,
    card: tarjeta({ name: 'Mastercard BHD', alerts: false, credit_limit: 25000 }),
    balance: saldo({
      charged: 31200, paid: 0, saldo: 31200, cycleCharged: 1100, aPagar: 30100,
      disponible: -6200, usoDelLimite: 124.8,
      ciclo: {
        lastStatement: '2026-08-25', nextStatement: '2026-09-25',
        nextDue: '2026-09-20', daysToStatement: 7, daysToDue: 2,
      },
    }),
    payments: [], mediosDePago: [],
  },
];

/**
 * La importación de un estado de cuenta del banco, con todo INVENTADO.
 *
 * El repo es público y un estado real tiene nombres, números de cuenta y en
 * qué gasta una persona: acá no hay nada de eso. La cuenta termina en 3456, la
 * Visa es la misma de las piezas de arriba y los comercios son los genéricos de
 * las pruebas.
 *
 * No se dibujan datos sueltos sino lo que devuelve el plan de verdad
 * (`planearImportacion` → `vistaDelPlan`): una línea de cada cosa que el plan
 * sabe hacer, así cada pieza muestra una rama distinta —lo que se pregunta, lo
 * que se anota, lo que ya estaba, lo que no se anota y lo ya importado—.
 */
const HOY_DEL_EXTRACTO = '2026-10-16';

interface LineaInventada {
  asentada: string;
  /** La fecha de la compra; sin ella, la misma del banco. */
  fecha?: string;
  centavos: number;
  clase: ClaseDeLinea;
  descripcion: string;
  comercio?: string;
  matchKey?: string;
  contraparte?: string;
  /** El índice de la compra, si es su devolución. */
  devolucionDe?: number;
}

const LINEAS_INVENTADAS: LineaInventada[] = [
  /* 0 */ { asentada: '2026-09-01', fecha: '2026-08-30', centavos: -35000, clase: 'purchase', comercio: 'Uber', descripcion: 'Uber', matchKey: 'uber' },
  /* 1 */ { asentada: '2026-09-01', fecha: '2026-08-31', centavos: -150000, clase: 'purchase', comercio: 'Shell', descripcion: 'Shell', matchKey: 'shell' },
  /* 2 */ { asentada: '2026-09-02', centavos: -15000, clase: 'fee', descripcion: 'Cargo por manejo de cuenta', matchKey: 'cargo manejo' },
  /* 3 */ { asentada: '2026-09-02', centavos: -225, clase: 'fee', descripcion: 'Impuesto DGII 0.15%', matchKey: 'impuesto dgii' },
  /* 4 */ { asentada: '2026-09-03', centavos: -500000, clase: 'withdrawal', descripcion: 'Retiro de efectivo', matchKey: 'retiro' },
  /* 5 */ { asentada: '2026-09-04', centavos: 1000000, clase: 'deposit', descripcion: 'Depósito en sucursal', matchKey: 'dep:sucursal' },
  /* 6 */ { asentada: '2026-09-05', centavos: 300000, clase: 'transfer_in', descripcion: 'Transferencia de Luis P. (··9999)', matchKey: 'de:9999', contraparte: '9999' },
  /* 7 */ { asentada: '2026-09-06', centavos: -800000, clase: 'transfer_out', descripcion: 'Pago a tarjeta (··4821)', matchKey: 'a:4821', contraparte: '4821' },
  /* 8 */ { asentada: '2026-09-08', centavos: -120000, clase: 'transfer_out', descripcion: 'Transferencia a Pedro R. (··5555)', matchKey: 'a:5555', contraparte: '5555' },
  /* 9 */ { asentada: '2026-09-09', centavos: -100000, clase: 'own_transfer', descripcion: 'Entre tus cuentas' },
  /* 10 */ { asentada: '2026-09-10', centavos: 1234, clase: 'interest', descripcion: 'Intereses de la cuenta', matchKey: 'intereses' },
  /* 11 */ { asentada: '2026-09-11', centavos: -500000, clase: 'purchase', comercio: 'Tienda Online', descripcion: 'Tienda Online', matchKey: 'tienda online' },
  /* 12 */ { asentada: '2026-09-12', centavos: 200000, clase: 'refund', comercio: 'Tienda Online', descripcion: 'Devolución de Tienda Online', matchKey: 'tienda online', devolucionDe: 11 },
  /* 13 */ { asentada: '2026-09-18', fecha: '2026-09-17', centavos: -95000, clase: 'purchase', comercio: 'PedidosYa', descripcion: 'PedidosYa', matchKey: 'pedidosya' },
  /* 14 */ { asentada: '2026-09-19', centavos: -40000, clase: 'purchase', comercio: 'Farmacia Uno', descripcion: 'Farmacia Uno', matchKey: 'farmacia uno' },
  /* 15 */ { asentada: '2026-09-22', centavos: -428050, clase: 'purchase', comercio: 'Supermercado Sol', descripcion: 'Supermercado Sol', matchKey: 'supermercado sol' },
  /* 16 */ { asentada: '2026-09-26', centavos: -186575, clase: 'purchase', comercio: 'Supermercado Sol', descripcion: 'Supermercado Sol', matchKey: 'supermercado sol' },
];

/**
 * El estado leído, con los saldos encadenados y las claves armadas con la
 * misma fórmula que la base (`asentada|centavos|saldo|n`): un estado que no
 * cuadra no llegaría nunca a la pantalla de revisión.
 */
function extractoInventado(movs: LineaInventada[]): ExtractoLeido {
  const inicial = 4520000;
  let saldo = inicial;
  const vistos = new Map<string, number>();
  const lineas: LineaDeExtracto[] = movs.map(m => {
    saldo += m.centavos;
    const triple = `${m.asentada}|${m.centavos}|${saldo}`;
    const n = vistos.get(triple) ?? 0;
    vistos.set(triple, n + 1);
    return {
      clave: `${triple}|${n}`, asentada: m.asentada, fecha: m.fecha ?? m.asentada,
      centavos: m.centavos, saldoCentavos: saldo, clase: m.clase, comercio: m.comercio ?? '',
      descripcion: m.descripcion, matchKey: m.matchKey ?? '', ultimos4Contraparte: m.contraparte ?? null,
      devolucionDe: null,
    };
  });
  movs.forEach((m, i) => {
    if (m.devolucionDe !== undefined) lineas[i].devolucionDe = lineas[m.devolucionDe].clave;
  });
  return {
    formato: 'popular-cuenta', banco: 'popular', producto: 'CUENTA DIGITAL LIBRE',
    tipoDeCuenta: 'savings', moneda: 'DOP', ultimos4: '3456',
    desde: lineas[0].asentada, hasta: lineas[lineas.length - 1].asentada,
    saldoInicialCentavos: inicial, saldoFinalCentavos: saldo,
    conciliacion: {
      lineas: lineas.length,
      creditos: lineas.filter(l => l.centavos > 0).length,
      debitos: lineas.filter(l => l.centavos < 0).length,
    },
    lineas,
  };
}

/** Exportado para probar la pantalla entera con los mismos datos (lo que la ruta de leer devolvería). */
export const EXTRACTO_INVENTADO = extractoInventado(LINEAS_INVENTADAS);

/** El libro "Personal" con las categorías de arranque (0021–0023), cada una con su ícono. */
function categoriasDelLibro(): Category[] {
  const lista: Category[] = [];
  const principal = (name: string, type: TransactionType, icon: string, color: string | null, subs: string[] = []) => {
    const id = `personal:${name}`;
    lista.push({
      id, ledger_id: 'personal', name, type, origen: 'app', parent_id: null, icon, color,
      created_at: `2026-01-01T00:00:${String(lista.length).padStart(2, '0')}Z`,
    });
    for (const sub of subs) {
      lista.push({
        id: `${id}:${sub}`, ledger_id: 'personal', name: sub, type, origen: 'app', parent_id: id,
        icon: null, color: null, created_at: `2026-01-01T00:00:${String(lista.length).padStart(2, '0')}Z`,
      });
    }
  };
  principal('Alimentación', 'expense', 'utensilios', 'orange', ['Desayuno', 'Almuerzo', 'Cena']);
  principal('Transporte', 'expense', 'auto', 'blue', ['Combustible', 'Taxi / Uber', 'Peaje', 'Transporte público']);
  principal('Salud', 'expense', 'salud', 'red', ['Farmacia', 'Consulta médica']);
  principal('Servicios básicos', 'expense', 'rayo', 'orange', ['Luz', 'Agua', 'Internet', 'Teléfono']);
  principal('Hogar', 'expense', 'casa', 'teal');
  principal('Suscripciones', 'expense', 'repetir', 'indigo', ['Streaming', 'Software']);
  principal('Otros personal', 'expense', 'etiqueta', null);
  principal('Salario', 'income', 'billetes', 'green', ['Sueldo']);
  principal('Inversiones', 'income', 'tendencia', 'green', ['Intereses', 'Dividendos']);
  principal('Otros ingreso personal', 'income', 'etiqueta', null);
  return lista;
}

export const CATEGORIAS_DEL_EXTRACTO = categoriasDelLibro();

const movimientoAnotado = (
  id: string, campos: Pick<MovimientoCandidato, 'centavos' | 'date' | 'description' | 'category'> &
    Partial<MovimientoCandidato>,
): MovimientoCandidato => ({
  id, type: 'expense', subcategory: null, source: 'manual', ledger_id: 'personal', card_id: null,
  author_id: 'yo', author_name: 'Yo', esCompraDelSuper: false, ...campos,
});

/** Lo que "la base" sabe: la cuenta, la Visa, dos cosas ya anotadas y una importación anterior. */
export const CONTEXTO_INVENTADO: ContextoDeExtracto = {
  migracionLista: true,
  movimientos: [
    // Anotado por WhatsApp el día de la compra: se enlaza solo.
    movimientoAnotado('tx-pedidosya', {
      centavos: 95000, date: '2026-09-17', description: 'PedidosYa', category: 'Alimentación',
      subcategory: 'Almuerzo', source: 'whatsapp', card_id: 'ahorros-popular',
    }),
    // Lo anotó otra persona de la cuenta compartida: se pregunta, nunca se enlaza solo.
    movimientoAnotado('tx-farmacia', {
      centavos: 40000, date: '2026-09-19', description: 'Farmacia', category: 'Salud',
      author_id: 'otra', author_name: 'Rosaura',
    }),
  ],
  pagosDeTarjeta: [],
  lineasPrevias: [{
    line_key: EXTRACTO_INVENTADO.lineas[0].clave, bank: 'popular', account_last4: '3456',
    decision: 'expense', kind: 'purchase', match_key: 'uber', transaction_id: 'tx-uber',
    card_payment_id: null, created_by_import: true, import_id: 'importacion-anterior',
    date: '2026-08-30', created_at: '2026-09-05T14:00:00Z',
  }],
  aprendido: [],
  cards: [
    tarjeta({
      id: 'ahorros-popular', name: 'Ahorros Popular', kind: 'savings', last4: '3456',
      credit_limit: null, statement_day: null, due_day: null, alerts: false,
    }),
    tarjeta({}),
  ],
  moneda: 'DOP',
  yo: 'yo',
};

const PLAN_INVENTADO = (() => {
  const plan = planearImportacion(EXTRACTO_INVENTADO, CONTEXTO_INVENTADO, {
    ledgerId: 'personal', ledgerName: 'Personal', categorias: CATEGORIAS_DEL_EXTRACTO,
    hoy: HOY_DEL_EXTRACTO,
  });
  // Un depósito ya decidido: la fila se queda en su grupo con la píldora en gris.
  return aplicarCambio(plan, EXTRACTO_INVENTADO.lineas[5].clave, { tipo: 'decidir', decision: 'income' });
})();

const VISTA_INVENTADA = vistaDelPlan(PLAN_INVENTADO);

export const EXTRACTO_RESUMEN: Pieza & {
  resumen: ResumenDeVista;
  boton: VistaDelPlan['boton'];
  libros: { id: string; nombre: string }[];
  libroId: string;
} = {
  id: 'extracto-resumen', titulo: 'Estado de cuenta · el resumen', ancho: 361,
  resumen: VISTA_INVENTADA.resumen,
  boton: VISTA_INVENTADA.boton,
  libros: [{ id: 'personal', nombre: 'Personal' }, { id: 'hogar', nombre: 'Hogar' }],
  libroId: 'personal',
};

const seccionInventada = (id: SeccionDeVista['id']): SeccionDeVista => {
  const s = VISTA_INVENTADA.secciones.find(x => x.id === id);
  if (!s) throw new Error(`la galería esperaba la sección ${id} en el estado inventado`);
  return s;
};

/**
 * Las secciones de la revisión, abiertas aunque alguna arranque plegada en la
 * pantalla: plegada sería solo el encabezado, y lo que hay que comparar son las
 * filas.
 */
export const EXTRACTO_SECCIONES: (Pieza & { seccion: SeccionDeVista })[] = [
  { id: 'extracto-revision', titulo: 'Estado de cuenta · para revisar', ancho: 361, seccion: seccionInventada('revisar') },
  { id: 'extracto-se-anotan', titulo: 'Estado de cuenta · se anotan', ancho: 361, seccion: seccionInventada('se-anotan') },
  { id: 'extracto-no-se-anotan', titulo: 'Estado de cuenta · no se anotan', ancho: 361, seccion: seccionInventada('no-se-anotan') },
];

/** La hoja de una compra del súper: categoría sugerida, la casilla de la otra igual y un candidato. */
export const EXTRACTO_HOJA: Pieza & { hoja: HojaDeLinea } = {
  id: 'extracto-hoja', titulo: 'Estado de cuenta · la hoja de una línea', ancho: 361,
  hoja: (() => {
    const h = hojaDeLinea(PLAN_INVENTADO, EXTRACTO_INVENTADO.lineas[15].clave);
    if (!h) throw new Error('la galería esperaba la hoja de la línea del súper');
    return h;
  })(),
};

/** Todas las piezas, para que el comparador sepa qué recortar. */
export const PIEZAS: Pieza[] = [
  ...RESUMENES, ...PRESUPUESTOS, ...ICONOS, ...MOVIMIENTOS, ...MOVIMIENTOS_ANCHO,
  ...ESTADOS_DE_CUENTA, EXTRACTO_RESUMEN, ...EXTRACTO_SECCIONES, EXTRACTO_HOJA,
];
