import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCategoriesWithUsage } from '@compartido/db';
import { CategoryWithUsage, TransactionType } from '@compartido/types';
import { db } from '../lib/datos';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';

interface Contexto {
  categorias: CategoryWithUsage[];
  /** Las PRINCIPALES de un tipo: lo que va en la grilla. */
  para: (type: TransactionType) => CategoryWithUsage[];
  /** Las que cuelgan de una categoría, ordenadas por nombre. */
  subDe: (parentId: string) => CategoryWithUsage[];
  /** El dibujo de una categoría a partir de su nombre. */
  dibujoDe: (nombre: string, type: TransactionType) => { icon: string | null; color: string | null };
  cargando: boolean;
  /** Vacío si cargaron bien. Las pantallas lo muestran en vez de callarlo. */
  error: string;
  refrescar: () => Promise<void>;
}

const vacio: Contexto = {
  categorias: [],
  para: () => [],
  subDe: () => [],
  dibujoDe: () => ({ icon: null, color: null }),
  cargando: true,
  error: '',
  refrescar: async () => {},
};

const ContextoDeCategorias = createContext<Contexto>(vacio);

export function useCategorias() {
  return useContext(ContextoDeCategorias);
}

/**
 * Las categorías de la cuenta activa. El gemelo de CategoriesContext.tsx.
 *
 * Se recargan al cambiar de cuenta: las categorías son de la cuenta, no del
 * usuario.
 *
 * `categorias` por props es para la galería, que dibuja los componentes con
 * datos fijos y sin sesión. Con sesión gana lo que traiga de la base.
 */
export function ProveedorDeCategorias({
  categorias: fijas, children,
}: {
  categorias?: CategoryWithUsage[];
  children: React.ReactNode;
}) {
  const { session } = useSesion();
  const { currentLedger, ledgers } = useCuenta();
  const ledgerId = currentLedger?.id ?? ledgers[0]?.id ?? null;
  const usuario = session?.user?.id;

  const [traidas, setTraidas] = useState<CategoryWithUsage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const refrescar = useCallback(async () => {
    // Sin cuenta no hay lista que pedir: recién entrado, el contexto de cuentas
    // todavía puede no haber cargado.
    if (!ledgerId || !usuario) { setTraidas([]); setCargando(false); return; }
    try {
      setTraidas(await getCategoriesWithUsage(db(usuario), ledgerId));
      setError('');
    } catch (err) {
      // Antes esto se descartaba en silencio: los desplegables quedaban vacíos
      // en toda la app sin decir por qué.
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las categorías.');
    } finally {
      setCargando(false);
    }
  }, [ledgerId, usuario]);

  useEffect(() => { refrescar(); }, [refrescar]);

  const categorias = fijas ?? traidas;
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

  const valor = useMemo(
    () => ({ categorias, para, subDe, dibujoDe, cargando: fijas ? false : cargando, error, refrescar }),
    [categorias, para, subDe, dibujoDe, fijas, cargando, error, refrescar],
  );
  return <ContextoDeCategorias.Provider value={valor}>{children}</ContextoDeCategorias.Provider>;
}
