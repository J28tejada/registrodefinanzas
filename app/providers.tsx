'use client';

import { LedgerProvider } from '@/components/LedgerContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <LedgerProvider>{children}</LedgerProvider>;
}
