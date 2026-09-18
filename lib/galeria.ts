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
import { BudgetProgress, TransactionType } from './types';

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

/** Todas las piezas, para que el comparador sepa qué recortar. */
export const PIEZAS: Pieza[] = [...RESUMENES, ...PRESUPUESTOS, ...ICONOS];
