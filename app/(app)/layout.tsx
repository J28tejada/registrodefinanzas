import AuthGuard from '@/components/AuthGuard';
import Navigation from '@/components/Navigation';
import SummaryBar from '@/components/SummaryBar';
import MobileHeader from '@/components/MobileHeader';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex h-[100dvh]">
        <Navigation />
        <div className="flex-1 min-w-0 md:ml-60 flex flex-col">
          <MobileHeader />
          <SummaryBar />
          <main
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 md:p-6"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
          >
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
