import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAllLedgersWithStats } from '@compartido/db';
import { Ledger, LedgerWithStats, Transaction } from '@compartido/types';
import { db } from '../lib/datos';
import { useSesion } from './ContextoDeSesion';

interface Contexto {
  currentLedger: Ledger | null;
  setCurrentLedger: (l: Ledger | null) => void;
  ledgers: LedgerWithStats[];
  refreshLedgers: () => Promise<void>;
  selectorOpen: boolean;
  setSelectorOpen: (v: boolean) => void;
  globalAddOpen: boolean;
  setGlobalAddOpen: (v: boolean) => void;
  /**
   * El movimiento que está abierto en el modal, o null si es uno nuevo.
   *
   * En la web cada pantalla dibuja su propio `AddTransactionModal` y se guarda
   * en un estado local cuál está editando. Acá el modal es uno solo, colgado de
   * la raíz —un `Modal` de React Native tapa la pantalla entera y dos abiertos a
   * la vez se pelean—, así que cuál se está editando tiene que vivir donde el
   * modal lo pueda leer: acá.
   */
  movimientoEnEdicion: Transaction | null;
  /** Abre el modal sobre un movimiento existente. */
  abrirMovimiento: (tx: Transaction) => void;
  /** Sube cada vez que se guarda un movimiento, en cualquier pantalla. */
  transactionVersion: number;
  notifyTransactionSaved: () => void;
}

const ContextoDeCuenta = createContext<Contexto>({
  currentLedger: null,
  setCurrentLedger: () => {},
  ledgers: [],
  refreshLedgers: async () => {},
  selectorOpen: false,
  setSelectorOpen: () => {},
  globalAddOpen: false,
  setGlobalAddOpen: () => {},
  movimientoEnEdicion: null,
  abrirMovimiento: () => {},
  transactionVersion: 0,
  notifyTransactionSaved: () => {},
});

export function useCuenta() {
  return useContext(ContextoDeCuenta);
}

/** Dónde se recuerda la cuenta elegida. En la web es localStorage. */
const CLAVE = 'currentLedgerId';

/**
 * Las cuentas del usuario. El gemelo de components/LedgerContext.tsx.
 *
 * Acá se ve la decisión de datos funcionando: la web pide `/api/ledgers`, que no
 * hace otra cosa que llamar a `getAllLedgersWithStats(db)` y devolver el JSON.
 * El teléfono llama a ESA MISMA función, sin ruta en el medio. Una petición
 * menos, un formato menos que mantener de los dos lados, y ninguna validación
 * duplicada — lo que separa los datos de una persona de los de otra sigue siendo
 * RLS, que corre en la base.
 *
 * La cuenta elegida se guarda en AsyncStorage y no en el Keychain: es una
 * preferencia, no una credencial, y el Keychain es lento.
 */
export function ProveedorDeCuenta({ children }: { children: React.ReactNode }) {
  const { session } = useSesion();
  const [currentLedger, setCurrentLedgerState] = useState<Ledger | null>(null);
  const [ledgers, setLedgers] = useState<LedgerWithStats[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [globalAddOpen, setGlobalAddOpenState] = useState(false);
  const [movimientoEnEdicion, setMovimientoEnEdicion] = useState<Transaction | null>(null);
  const [transactionVersion, setTransactionVersion] = useState(0);
  const restaurada = useRef(false);

  const notifyTransactionSaved = useCallback(() => setTransactionVersion(v => v + 1), []);

  /*
   * Abrir el modal "en blanco" tiene que olvidar lo anterior.
   *
   * Sin esto, después de editar un gasto el botón + del medio volvía a abrir
   * ESE gasto: el modal se cierra pero el movimiento se queda guardado, y la
   * próxima vez que alguien toca + lo encuentra ahí. Guardar entonces pisa un
   * movimiento viejo en vez de crear uno nuevo, sin que nada lo advierta.
   */
  const setGlobalAddOpen = useCallback((v: boolean) => {
    if (!v) setMovimientoEnEdicion(null);
    setGlobalAddOpenState(v);
  }, []);

  const abrirMovimiento = useCallback((tx: Transaction) => {
    setMovimientoEnEdicion(tx);
    setGlobalAddOpenState(true);
  }, []);

  const refreshLedgers = useCallback(async () => {
    if (!session?.user?.id) { setLedgers([]); return; }
    try {
      setLedgers(await getAllLedgersWithStats(db(session.user.id)));
    } catch {
      // Sin red se sigue con lo que ya estaba: igual que en la web.
    }
  }, [session?.user?.id]);

  useEffect(() => { refreshLedgers(); }, [refreshLedgers]);

  // La cuenta guardada se restaura una sola vez, cuando ya hay lista contra la
  // cual buscarla.
  useEffect(() => {
    if (ledgers.length === 0 || restaurada.current) return;
    restaurada.current = true;
    AsyncStorage.getItem(CLAVE).then(id => {
      if (!id) return;
      const encontrada = ledgers.find(l => l.id === id);
      if (encontrada) setCurrentLedgerState(encontrada);
    });
  }, [ledgers]);

  // Que la cuenta activa tenga los números frescos después de recargar.
  useEffect(() => {
    if (!currentLedger || ledgers.length === 0) return;
    const actualizada = ledgers.find(l => l.id === currentLedger.id);
    if (actualizada && (
      actualizada.transactionCount !== (currentLedger as LedgerWithStats).transactionCount ||
      actualizada.balance !== (currentLedger as LedgerWithStats).balance
    )) {
      setCurrentLedgerState(actualizada);
    }
  }, [ledgers, currentLedger]);

  const setCurrentLedger = useCallback((l: Ledger | null) => {
    setCurrentLedgerState(l);
    if (l) AsyncStorage.setItem(CLAVE, l.id);
    else AsyncStorage.removeItem(CLAVE);
  }, []);

  return (
    <ContextoDeCuenta.Provider value={{
      currentLedger, setCurrentLedger, ledgers, refreshLedgers,
      selectorOpen, setSelectorOpen, globalAddOpen, setGlobalAddOpen,
      movimientoEnEdicion, abrirMovimiento,
      transactionVersion, notifyTransactionSaved,
    }}>
      {children}
    </ContextoDeCuenta.Provider>
  );
}
