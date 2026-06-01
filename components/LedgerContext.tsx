'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Ledger, LedgerWithStats } from '@/lib/types';

interface LedgerContextType {
  currentLedger: Ledger | null;
  setCurrentLedger: (l: Ledger | null) => void;
  ledgers: LedgerWithStats[];
  refreshLedgers: () => Promise<void>;
  selectorOpen: boolean;
  setSelectorOpen: (open: boolean) => void;
}

export const LedgerContext = createContext<LedgerContextType>({
  currentLedger: null,
  setCurrentLedger: () => {},
  ledgers: [],
  refreshLedgers: async () => {},
  selectorOpen: false,
  setSelectorOpen: () => {},
});

export function useLedger() {
  return useContext(LedgerContext);
}

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [currentLedger, setCurrentLedgerState] = useState<Ledger | null>(null);
  const [ledgers, setLedgers] = useState<LedgerWithStats[]>([]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const restoredRef = useRef(false);

  const refreshLedgers = useCallback(async () => {
    try {
      const res = await fetch('/api/ledgers');
      const data = await res.json();
      if (Array.isArray(data)) {
        setLedgers(data);
      }
    } catch {
      // ignore network errors
    }
  }, []);

  useEffect(() => {
    refreshLedgers();
  }, [refreshLedgers]);

  // Restore saved ledger from localStorage once ledgers are loaded
  useEffect(() => {
    if (ledgers.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    const savedId = localStorage.getItem('currentLedgerId');
    if (savedId) {
      const found = ledgers.find(l => l.id === savedId);
      if (found) setCurrentLedgerState(found);
    }
  }, [ledgers]);

  // Keep currentLedger in sync with fresh stats after refresh
  useEffect(() => {
    if (!currentLedger || ledgers.length === 0) return;
    const updated = ledgers.find(l => l.id === currentLedger.id);
    if (updated && (
      updated.transactionCount !== (currentLedger as LedgerWithStats).transactionCount ||
      updated.balance !== (currentLedger as LedgerWithStats).balance
    )) {
      setCurrentLedgerState(updated);
    }
  }, [ledgers, currentLedger]);

  const setCurrentLedger = useCallback((l: Ledger | null) => {
    setCurrentLedgerState(l);
    if (l) localStorage.setItem('currentLedgerId', l.id);
    else localStorage.removeItem('currentLedgerId');
  }, []);

  return (
    <LedgerContext.Provider value={{
      currentLedger,
      setCurrentLedger,
      ledgers,
      refreshLedgers,
      selectorOpen,
      setSelectorOpen,
    }}>
      {children}
    </LedgerContext.Provider>
  );
}
