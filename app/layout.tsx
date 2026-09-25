import type { Metadata, Viewport } from 'next';
import tema from '@/lib/tema.json';
import { Inter } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/AppShell';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Jobidai Wallet',
  description: 'Gestiona tus finanzas con múltiples cuentas, presupuestos e IA',
};

// La barra del navegador del teléfono se pinta del mismo fondo que la app, en
// claro y en oscuro.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: tema.claro.fondo },
    { media: '(prefers-color-scheme: dark)', color: tema.oscuro.fondo },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-fondo text-tinta min-h-screen`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
