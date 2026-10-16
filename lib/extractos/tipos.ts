/**
 * Los contratos de la importación de estados de cuenta.
 *
 * Todo `lib/extractos/` es compartido con el teléfono y puro: sin Next, sin
 * Node, sin DOM, sin Intl y sin `parseFloat` sobre plata. La única excepción
 * son `pdf.ts` y `leer.ts`, que importan unpdf y corren solo en el servidor
 * (el mismo trato que `lib/gmail.ts`): el teléfono no puede correr pdf.js, así
 * que le manda el PDF a la web y recibe esto ya leído.
 *
 * La plata viaja SIEMPRE en centavos enteros. Sumar 68 montos en decimales y
 * compararlos con el total del banco falla por redondeo; en centavos, o cuadra
 * exacto o no cuadra.
 */
import type { Card, NuevaCard, TransactionSource, TransactionType } from '../types';

// ─── Lo que sale del PDF ──────────────────────────────────────────────────────

/** Un pedazo de texto tal como lo deja pdf.js, con dónde está en la página. */
export interface FragmentoPdf {
  s: string;
  /** Borde izquierdo, en puntos desde la izquierda de la página. */
  x: number;
  /** Altura de la línea base, en puntos desde ABAJO (así cuenta PDF). */
  y: number;
  /** Borde derecho (x + ancho). Los montos van alineados a la derecha. */
  fin: number;
  /** Desde 1. */
  pagina: number;
}

/** Los fragmentos que comparten renglón, de izquierda a derecha. */
export interface RenglonPdf {
  pagina: number;
  y: number;
  fragmentos: FragmentoPdf[];
}

/** Qué es cada línea del banco. Decide qué se hace con ella por defecto. */
export type ClaseDeLinea =
  | 'purchase'      // compra con la tarjeta de débito (POS W/D)
  | 'fee'           // cargo del banco, impuesto DGII, seguro
  | 'withdrawal'    // retiro de efectivo
  | 'deposit'       // depósito en sucursal o cajero
  | 'interest'      // intereses que paga la cuenta
  | 'refund'        // devolución de una compra
  | 'transfer_out'  // transferencia a un tercero
  | 'transfer_in'   // transferencia de un tercero
  | 'own_transfer'  // entre cuentas del mismo titular
  | 'other';

/** Una línea tal como la imprimió el banco, antes de interpretarla. */
export interface LineaCruda {
  /** Fecha de entrada (cuando el banco la asentó), ISO. */
  asentada: string;
  /** Fecha de la transacción (cuando pasó), ISO. Es la que se guarda. */
  fecha: string;
  /**
   * El detalle por pedazos: primero los fragmentos del primer renglón en orden
   * (el primero suele ser el comercio limpio), después cada renglón de
   * continuación entero. Se clasifica sobre todo esto unido con espacios.
   */
  detalle: string[];
  /** Con signo: negativo = débito. Nunca cero. */
  centavos: number;
  /** El balance que imprime el banco después de esta línea. */
  saldoCentavos: number;
  pagina: number;
}

export interface ResumenDelBanco {
  saldoAnteriorCentavos: number;
  creditos: { n: number; centavos: number };
  debitos: { n: number; centavos: number };
  interesPagadoCentavos: number;
  interesCargadoCentavos: number;
  saldoAlCorteCentavos: number;
}

/** Lo que el lector de un formato saca del PDF. Tiene datos personales: solo servidor. */
export interface LecturaCruda {
  formato: 'popular-cuenta';
  banco: 'popular';
  /** Como lo nombra el banco: 'CUENTA DIGITAL LIBRE'. */
  producto: string;
  tipoDeCuenta: 'savings' | 'checking';
  moneda: 'DOP' | 'USD';
  /** Solo los últimos 4 del número de cuenta. El número entero no se guarda nunca. */
  ultimos4: string;
  /** Nombre del titular como sale en el encabezado. NUNCA sale del servidor. */
  titular: string;
  /** Fecha de corte, ISO. */
  corte: string;
  /** El renglón BALANCE ANTERIOR de la tabla. */
  saldoInicialCentavos: number;
  /** El renglón BALANCE AL CORTE de la tabla. */
  saldoFinalCentavos: number;
  resumen: ResumenDelBanco;
  lineas: LineaCruda[];
}

export type CodigoDeLectura =
  | 'NO_ES_PDF'
  | 'MUY_GRANDE'
  | 'CLAVE_REQUERIDA'
  | 'CLAVE_INCORRECTA'
  | 'SIN_TEXTO'
  | 'FORMATO_DESCONOCIDO'
  | 'NO_CUADRA'
  | 'MUY_LARGO'
  | 'ILEGIBLE';

/** Qué control falló al cuadrar contra el banco. */
export type MotivoNoCuadra = 'apertura' | 'conteo' | 'totales' | 'saldo' | 'cierre' | 'signo' | 'fechas';

/** Una línea ya interpretada y limpia: lo que viaja al cliente. */
export interface LineaDeExtracto {
  /** `asentada|centavos|saldo|n`: la misma fórmula que arma la función SQL. */
  clave: string;
  asentada: string;
  fecha: string;
  centavos: number;
  saldoCentavos: number;
  clase: ClaseDeLinea;
  /** El comercio o la contraparte, limpio ('Shell', 'PedidosYa'). Puede ser ''. */
  comercio: string;
  /** La descripción que se guardaría, ya armada y enmascarada. Máx. 120. */
  descripcion: string;
  /**
   * Con qué se aprende: el comercio normalizado ('shell', 'pedidosya'), o la
   * contraparte por sus últimos 4 ('a:1234', 'de:1234'), o 'dep:acte'. Máx. 60.
   */
  matchKey: string;
  /** Los últimos 4 de la cuenta del otro lado, si el banco los imprime. */
  ultimos4Contraparte: string | null;
  /** Si es una devolución con su compra en este mismo estado: la clave de esa compra. */
  devolucionDe: string | null;
}

/** El estado de cuenta leído, cuadrado y limpio. Sin nombre del titular ni números enteros. */
export interface ExtractoLeido {
  formato: 'popular-cuenta';
  banco: 'popular';
  producto: string;
  tipoDeCuenta: 'savings' | 'checking';
  moneda: 'DOP' | 'USD';
  ultimos4: string;
  /** Primera y última fecha de entrada del período, ISO. */
  desde: string;
  hasta: string;
  saldoInicialCentavos: number;
  saldoFinalCentavos: number;
  conciliacion: { lineas: number; creditos: number; debitos: number };
  lineas: LineaDeExtracto[];
}

export type ResultadoDeLectura =
  | { ok: true; extracto: ExtractoLeido; paginas: number }
  | { ok: false; codigo: CodigoDeLectura; motivo?: MotivoNoCuadra; fecha?: string };

// ─── Lo que la base aporta para cotejar ──────────────────────────────────────

/** Lo que guarda `statement_lines.decision`. */
export type DecisionGuardada = 'expense' | 'income' | 'linked' | 'card_payment' | 'netted' | 'skipped';

/** Un movimiento ya anotado que podría ser una línea del banco. */
export interface MovimientoCandidato {
  id: string;
  type: TransactionType;
  centavos: number;
  date: string;
  description: string;
  category: string;
  subcategory: string | null;
  source: TransactionSource;
  ledger_id: string | null;
  card_id: string | null;
  /** Quién lo anotó. Si no soy yo, nunca se enlaza solo. */
  author_id: string | null;
  author_name: string | null;
  /** Salió de cerrar una compra del súper: se guardó con el total estimado del carrito. */
  esCompraDelSuper: boolean;
}

/** Un pago de tarjeta ya registrado (`card_payments`). */
export interface PagoCandidato {
  id: string;
  card_id: string;
  source_card_id: string | null;
  centavos: number;
  date: string;
}

/** Una línea que ya pasó por una importación anterior. */
export interface LineaPrevia {
  line_key: string;
  bank: string;
  account_last4: string;
  decision: DecisionGuardada;
  kind: ClaseDeLinea;
  match_key: string;
  transaction_id: string | null;
  card_payment_id: string | null;
  created_by_import: boolean;
  import_id: string;
  date: string;
  created_at: string;
}

/** Lo que se decidió antes para un `match_key`, con la categoría que tiene HOY su movimiento. */
export interface Aprendido {
  match_key: string;
  decision: DecisionGuardada;
  /** Del movimiento enlazado, si sigue existiendo. Una recategorización posterior enseña. */
  type: TransactionType | null;
  category: string | null;
  subcategory: string | null;
  ledger_id: string | null;
  created_at: string;
}

export interface ContextoDeExtracto {
  /**
   * False si la base todavía no tiene la migración 0024. Se puede leer y
   * revisar, pero no importar: importar sin la clave duplicaría en la próxima.
   */
  migracionLista: boolean;
  movimientos: MovimientoCandidato[];
  pagosDeTarjeta: PagoCandidato[];
  lineasPrevias: LineaPrevia[];
  aprendido: Aprendido[];
  /** Todas, archivadas incluidas: una cuenta archivada igual puede ser la del estado. */
  cards: Card[];
  /** La moneda de la persona (ISO), para frenar un estado en otra moneda. */
  moneda: string;
  /** El id de quien importa. */
  yo: string;
}

// ─── Lo que se manda a importar ──────────────────────────────────────────────

/** Lo que entiende la función SQL `importar_estado_de_cuenta`. */
export type DecisionDePedido = 'pending' | DecisionGuardada;

export interface CabeceraDePedido {
  bank: string;
  last4: string;
  /** Null solo si viene `cuentaNueva`: se completa al crearla, antes de llamar a la función. */
  account_card_id: string | null;
  ledger_id: string;
  opening_cents: number;
  closing_cents: number;
  line_count: number;
}

/**
 * Una línea del pedido. Van TODAS las líneas del estado, en orden, aunque no
 * se decidan: la función vuelve a cuadrar la cadena de saldos entera y arma
 * las claves ella misma.
 */
export interface LineaDePedido {
  posted: string;
  date: string;
  cents: number;
  balance: number;
  kind: ClaseDeLinea;
  decision: DecisionDePedido;
  match_key: string;
  category?: string;
  subcategory?: string | null;
  description?: string;
  /** Para `card_payment`: la tarjeta de crédito que se paga. */
  credit_card_id?: string;
  /** Para `linked`: el movimiento que ya estaba. */
  transaction_id?: string;
  /** Para `linked` contra un pago de tarjeta ya registrado. */
  card_payment_id?: string;
  /** Una compra que se guarda por su neto, porque su devolución está en este estado. */
  net_cents?: number;
  /** Para `netted`: la clave de la compra a la que se le descuenta. */
  nets_key?: string;
}

export interface PedidoDeImportacion {
  cab: CabeceraDePedido;
  lineas: LineaDePedido[];
  /** La cuenta del banco no estaba en la Billetera: se crea antes de importar. */
  cuentaNueva?: NuevaCard;
  /** La cuenta existía sin últimos 4: se le guardan. */
  completarLast4?: { card_id: string; last4: string };
  /** Categorías a crear antes de importar ('Cargos bancarios'). */
  categoriasNuevas?: { ledger_id: string; name: string; type: TransactionType }[];
}

export interface ResultadoDeImportacion {
  importId: string;
  creados: number;
  enlazados: number;
  pagos: number;
  omitidos: number;
  yaEstaban: number;
  /** La cuenta del banco que quedó (la existente o la recién creada). */
  cardId: string;
}

/** Los códigos que puede tirar la función SQL. Ver `ERRORES_DE_IMPORTACION`. */
export type CodigoDeImportacion =
  | 'NO_AUTENTICADO'
  | 'NO_CUADRA'
  | 'FECHA_INVALIDA'
  | 'DECISION_INVALIDA'
  | 'SIGNO_INVALIDO'
  | 'NETO_INVALIDO'
  | 'CUENTA_INVALIDA'
  | 'LIBRO_INVALIDO'
  | 'CATEGORIA_INVALIDA'
  | 'TARJETA_INVALIDA'
  | 'MOVIMIENTO_INVALIDO'
  | 'YA_ENLAZADO'
  | 'REINTENTAR';
