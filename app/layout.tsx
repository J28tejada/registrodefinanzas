import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Registro de Finanzas',
  description: 'Gestiona tus ingresos y gastos personales y de negocio con IA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="es">
        <body className={`${inter.className} bg-slate-950 text-white`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
