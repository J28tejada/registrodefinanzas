import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Registro de Finanzas',
  description: 'Gestiona tus finanzas con múltiples cuentas e IA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-slate-950 text-white min-h-screen`}>
        <Providers>
          <div className="flex min-h-screen">
            <Navigation />
            <main className="flex-1 md:ml-60 p-4 md:p-6 pb-24 md:pb-6">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
