import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import SummaryBar from '@/components/SummaryBar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Registro de Finanzas',
  description: 'Gestiona tus ingresos y gastos personales y de negocio con IA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-slate-950 text-white min-h-screen`}>
        <div className="flex min-h-screen">
          <Navigation />
          <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
            <SummaryBar />
            <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
