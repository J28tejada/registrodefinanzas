import type { MetadataRoute } from 'next';
import { COLOR_MARCA } from '@/lib/icono';

/**
 * Lo que lee Android al "Agregar a pantalla de inicio": nombre, colores e
 * íconos. Sin esto usa una captura de la página y el título del documento.
 *
 * Los íconos salen de `app/icons/[tamano]`, y usan el mismo dibujo que el
 * favicon: si Android tomara otro, la app se vería con dos identidades.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jobidai Wallet',
    // El que se ve bajo el ícono: si no entra, Android lo corta.
    short_name: 'Jobidai',
    description: 'Gestiona tus finanzas con múltiples cuentas, presupuestos e IA',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: COLOR_MARCA,
    lang: 'es',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
