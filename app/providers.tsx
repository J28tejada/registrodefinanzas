'use client';

import { LedgerProvider, useLedger } from '@/components/LedgerContext';
import { SettingsProvider } from '@/components/SettingsContext';
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
    <SettingsProvider>
      <LedgerProvider>
        {children}
        <GlobalAddModal />
      </LedgerProvider>
    </SettingsProvider>
  );
}
