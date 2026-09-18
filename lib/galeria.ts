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
import { BudgetProgress, Transaction, TransactionType } from './types';

export interface Pieza {
  /** El identificador que busca el comparador. Sin espacios ni acentos. */
  id: string;
  /** Lo que se lee arriba de la pieza en la galería. */
  titulo: string;
  /** Ancho fijo en píxeles: las dos capturas tienen que medir lo mismo. */
  ancho: number;
}

export const ANCHO_POR_DEFECTO = 320;

export const RESUMENES: (Pieza & {
  title: string; subtitle: string; amount: number;
  variant: 'income' | 'expense' | 'balance';
})[] = [
  { id: 'resumen-ingresos', titulo: 'Resumen · ingresos', ancho: ANCHO_POR_DEFECTO,
    title: 'Ingresos', subtitle: 'del mes', amount: 24700, variant: 'income' },
  { id: 'resumen-gastos', titulo: 'Resumen · gastos', ancho: ANCHO_POR_DEFECTO,
    title: 'Gastos', subtitle: 'del mes', amount: 16921, variant: 'expense' },
  { id: 'resumen-balance', titulo: 'Resumen · balance', ancho: ANCHO_POR_DEFECTO,
    title: 'Balance', subtitle: 'del mes', amount: 7779, variant: 'balance' },
  // El balance negativo agrega un renglón que las otras no tienen.
  { id: 'resumen-negativo', titulo: 'Resumen · balance negativo', ancho: ANCHO_POR_DEFECTO,
    title: 'Balance', subtitle: 'del mes', amount: -3200, variant: 'balance' },
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
  ...p, id: 'movimientos-lista-ancha', titulo: 'Movimientos · la lista (sin envolver)', ancho: 560,
}));

/** Todas las piezas, para que el comparador sepa qué recortar. */
export const PIEZAS: Pieza[] = [...RESUMENES, ...PRESUPUESTOS, ...ICONOS, ...MOVIMIENTOS, ...MOVIMIENTOS_ANCHO];
