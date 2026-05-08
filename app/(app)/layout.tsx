import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Navigation from '@/components/Navigation';
import SummaryBar from '@/components/SummaryBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    redirect('/sign-in');
  }
  if (!userId) redirect('/sign-in');

  return (
    <div className="flex h-[100dvh]">
      <Navigation />
      <div className="flex-1 min-w-0 md:ml-60 flex flex-col">
        <SummaryBar />
        <main
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 md:p-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
