'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CategoryWithUsage, TransactionType } from '@/lib/types';
import { useLedger } from './LedgerContext';

interface Contexto {
  categorias: CategoryWithUsage[];
  cargando: boolean;
  refrescar: () => Promise<void>;
  /** Las de un tipo, en la cuenta activa: lo que va en un desplegable. */
  para: (type: TransactionType) => CategoryWithUsage[];
  /** Vacío si cargaron bien. Las pantallas lo muestran en vez de callarlo. */
  error: string;
}

const CategoriesContext = createContext<Contexto>({
  categorias: [],
  cargando: true,
  error: '',
  refrescar: async () => {},
  para: () => [],
});

export function useCategories() {
  return useContext(CategoriesContext);
}

/**
 * Las categorías del usuario, cargadas una vez.
 *
 * Antes eran una constante del código y cualquier pantalla las importaba. Ahora
 * salen de la base, y sin esto cada desplegable haría su propia consulta.
 */
export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  // Las categorías son de la cuenta, así que se recargan al cambiar de cuenta.
  const { currentLedger, ledgers } = useLedger();
  const ledgerId = currentLedger?.id ?? ledgers[0]?.id ?? null;

  const [categorias, setCategorias] = useState<CategoryWithUsage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const refrescar = useCallback(async () => {
    // Sin cuenta no hay lista que pedir: recién creado el usuario, el contexto
    // de cuentas todavía puede no haber cargado.
    if (!ledgerId) { setCategorias([]); setCargando(false); return; }
    try {
      const res = await fetch(`/api/categories?ledger_id=${ledgerId}`);
      const datos = await res.json();
      if (Array.isArray(datos)) {
        setCategorias(datos);
        setError('');
        return;
      }
      // Antes esto se descartaba en silencio: si la respuesta no era una lista,
      // los desplegables quedaban vacíos en toda la app sin decir por qué, y no
      // había manera de darse cuenta de que había fallado algo.
      setError(datos?.error ?? 'No se pudieron cargar las categorías.');
    } catch {
      setError('No se pudieron cargar las categorías. Revisá la conexión.');
    } finally {
      setCargando(false);
    }
  }, [ledgerId]);

  useEffect(() => { refrescar(); }, [refrescar]);

  const para = useCallback(
    (type: TransactionType) => categorias.filter(c => c.type === type),
    [categorias],
  );

  return (
    <CategoriesContext.Provider value={{ categorias, cargando, error, refrescar, para }}>
      {children}
    </CategoriesContext.Provider>
  );
}
