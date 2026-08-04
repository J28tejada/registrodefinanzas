import { ImageResponse } from 'next/og';
import { IconoMarca } from '@/lib/icono';

/**
 * El ícono que usa iOS al agregar la app a la pantalla de inicio.
 *
 * 180×180 es el tamaño que pide Apple. Sin esquinas redondeadas y sin
 * transparencia a propósito: iOS aplica su propia máscara con forma de
 * squircle, y si el PNG ya viene redondeado quedan bordes oscuros alrededor.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    <IconoMarca size={180} radio={0} />,
    { ...size },
  );
}
