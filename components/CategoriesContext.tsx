'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CategoryWithUsage, TransactionType } from '@/lib/types';
import { useLedger } from './LedgerContext';

interface Contexto {
  categorias: CategoryWithUsage[];
  cargando: boolean;
  refrescar: () => Promise<void>;
  /** Las PRINCIPALES de un tipo, en la cuenta activa: lo que va en la grilla. */
  para: (type: TransactionType) => CategoryWithUsage[];
  /**
   * Las que cuelgan de una categoría, ordenadas por nombre.
   *
   * Vacío es un resultado normal y frecuente: una categoría propia recién creada
   * no tiene ninguna, y la pantalla simplemente no muestra el segundo nivel.
   */
  subDe: (parentId: string) => CategoryWithUsage[];
  /**
   * El dibujo de una categoría a partir de su nombre.
   *
   * Los movimientos guardan el nombre en texto, no una referencia, así que para
   * dibujarles el ícono hay que volver a buscar la categoría. Devuelve el
   * genérico cuando no aparece —una categoría de otra cuenta, o una borrada—,
   * que es exactamente lo que hay que mostrar en ese caso.
   */
  dibujoDe: (nombre: string, type: TransactionType) => { icon: string | null; color: string | null };
  /** Vacío si cargaron bien. Las pantallas lo muestran en vez de callarlo. */
  error: string;
}

const CategoriesContext = createContext<Contexto>({
  categorias: [],
  cargando: true,
  error: '',
  refrescar: async () => {},
  para: () => [],
  subDe: () => [],
  dibujoDe: () => ({ icon: null, color: null }),
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

  // Solo las principales: las subcategorías se piden aparte, ya sabiendo de cuál
  // cuelgan. Mezcladas en la grilla, "Supermercado" aparecería al mismo nivel
  // que "Alimentación" y el segundo nivel no significaría nada.
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
      // Sin distinguir mayúsculas: el agente de WhatsApp anota lo que entiende
      // y "combustible" tiene que encontrar a "Combustible".
      const buscado = nombre.trim().toLowerCase();
      // Entre las principales: el nombre que guarda el movimiento en `category`
      // es siempre el de una de ellas.
      const cat = categorias.find(
        c => c.type === type && !c.parent_id && c.name.toLowerCase() === buscado,
      );
      return { icon: cat?.icon ?? null, color: cat?.color ?? null };
    },
    [categorias],
  );

  return (
    <CategoriesContext.Provider value={{ categorias, cargando, error, refrescar, para, subDe, dibujoDe }}>
      {children}
    </CategoriesContext.Provider>
  );
}
