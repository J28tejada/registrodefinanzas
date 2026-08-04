import { ImageResponse } from 'next/og';
import { IconoMarca } from '@/lib/icono';

/** El favicon de la pestaña. Los tamaños grandes viven en `app/icons/`. */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(<IconoMarca size={32} radio={8} />, { ...size });
}
