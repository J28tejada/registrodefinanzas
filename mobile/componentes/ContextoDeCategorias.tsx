import { createContext, useCallback, useContext, useMemo } from 'react';
import { CategoryWithUsage, TransactionType } from '@compartido/types';

interface Contexto {
  categorias: CategoryWithUsage[];
  /** Las PRINCIPALES de un tipo: lo que va en la grilla. */
  para: (type: TransactionType) => CategoryWithUsage[];
  /** Las que cuelgan de una categoría, ordenadas por nombre. */
  subDe: (parentId: string) => CategoryWithUsage[];
  /** El dibujo de una categoría a partir de su nombre. */
  dibujoDe: (nombre: string, type: TransactionType) => { icon: string | null; color: string | null };
}

const vacio: Contexto = {
  categorias: [],
  para: () => [],
  subDe: () => [],
  dibujoDe: () => ({ icon: null, color: null }),
};

const ContextoDeCategorias = createContext<Contexto>(vacio);

export function useCategorias() {
  return useContext(ContextoDeCategorias);
}

/**
 * Las categorías de la cuenta activa, con la misma forma que el contexto de la
 * web (`components/CategoriesContext.tsx`).
 *
 * Todavía no las trae de la base: de dónde las lee el teléfono es la decisión
 * que falta. Hasta entonces recibe la lista por props, que es lo que necesita la
 * galería, y las pantallas la van a recibir del proveedor real sin cambiar una
 * línea de quien la consume.
 *
 * Sin lista devuelve el dibujo genérico — exactamente lo que hace la web cuando
 * la petición todavía no volvió.
 */
export function ProveedorDeCategorias({
  categorias = [], children,
}: {
  categorias?: CategoryWithUsage[];
  children: React.ReactNode;
}) {
  const para = useCallback(
    (type: TransactionType) => categorias.filter(c => c.type === type && !c.parent_id),
    [categorias],
  );

  const subDe = useCallback(
    (parentId: string) => categorias
      .filter(c => c.parent_id === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [categorias],
  );

  const dibujoDe = useCallback(
    (nombre: string, type: TransactionType) => {
      // Sin distinguir mayúsculas: el agente anota lo que entiende y
      // "combustible" tiene que encontrar a "Combustible".
      const buscado = nombre.trim().toLowerCase();
      const cat = categorias.find(
        c => c.type === type && !c.parent_id && c.name.toLowerCase() === buscado,
      );
      return { icon: cat?.icon ?? null, color: cat?.color ?? null };
    },
    [categorias],
  );

  const valor = useMemo(() => ({ categorias, para, subDe, dibujoDe }), [categorias, para, subDe, dibujoDe]);
  return <ContextoDeCategorias.Provider value={valor}>{children}</ContextoDeCategorias.Provider>;
}
