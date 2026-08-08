'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CategoryWithUsage, TransactionScope, TransactionType } from '@/lib/types';

interface Contexto {
  categorias: CategoryWithUsage[];
  cargando: boolean;
  refrescar: () => Promise<void>;
  /** Las de un tipo y ámbito, ya ordenadas: lo que va en un desplegable. */
  para: (type: TransactionType, scope: TransactionScope) => CategoryWithUsage[];
}

const CategoriesContext = createContext<Contexto>({
  categorias: [],
  cargando: true,
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
  const [categorias, setCategorias] = useState<CategoryWithUsage[]>([]);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      const datos = await res.json();
      if (Array.isArray(datos)) setCategorias(datos);
    } catch {
      // Sin categorías los desplegables quedan vacíos, pero la pantalla carga.
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { refrescar(); }, [refrescar]);

  const para = useCallback(
    (type: TransactionType, scope: TransactionScope) =>
      categorias.filter(c => c.type === type && c.scope === scope),
    [categorias],
  );

  return (
    <CategoriesContext.Provider value={{ categorias, cargando, refrescar, para }}>
      {children}
    </CategoriesContext.Provider>
  );
}
