'use client';

import { LedgerProvider, useLedger } from '@/components/LedgerContext';
import { SettingsProvider } from '@/components/SettingsContext';
import { CategoriesProvider } from '@/components/CategoriesContext';
import AddTransactionModal from '@/components/AddTransactionModal';

function GlobalAddModal() {
  const { globalAddOpen, setGlobalAddOpen, notifyTransactionSaved, refreshLedgers } = useLedger();
  if (!globalAddOpen) return null;
  return (
    <AddTransactionModal
      isOpen={globalAddOpen}
      onClose={() => setGlobalAddOpen(false)}
      onSave={() => { notifyTransactionSaved(); refreshLedgers(); }}
      editingTransaction={null}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    /* El orden importa: las categorías son de la cuenta activa, así que
       `CategoriesProvider` usa `useLedger` y tiene que estar DENTRO. Al revés
       leería el contexto vacío por defecto y nunca cargaría ninguna. */
    <SettingsProvider>
      <LedgerProvider>
        <CategoriesProvider>
          {children}
          <GlobalAddModal />
        </CategoriesProvider>
      </LedgerProvider>
    </SettingsProvider>
  );
}
