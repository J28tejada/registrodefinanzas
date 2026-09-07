'use client';

import { colorDeCategoria, iconoDeCategoria } from '@/lib/iconos-categoria';
import { TransactionType } from '@/lib/types';

const TAMANOS = {
  sm: { caja: 'w-8 h-8',   icono: 'w-4 h-4' },
  md: { caja: 'w-11 h-11', icono: 'w-5 h-5' },
  lg: { caja: 'w-14 h-14', icono: 'w-6 h-6' },
} as const;

/**
 * El ícono de una categoría, en su color.
 *
 * En un componente y no suelto en cada pantalla porque aparece en cinco
 * lugares —la lista de movimientos, el selector, el administrador, los
 * presupuestos, las estadísticas— y tienen que verse iguales: si el círculo de
 * la lista y el del selector no coinciden, deja de servir para reconocerla.
 *
 * El color va en estilo y no en clases de Tailwind: sale de la base, y Tailwind
 * solo genera las clases que ve escritas en el código.
 */
export default function CategoryIcon({
  icon, color, type, size = 'md', className = '',
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  type: TransactionType;
  size?: keyof typeof TAMANOS;
  className?: string;
}) {
  const Icono = iconoDeCategoria(icon);
  const tinte = colorDeCategoria(color, type);
  const { caja, icono } = TAMANOS[size];

  return (
    <div
      className={`${caja} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      // El fondo es el mismo color a un 18%: así el círculo se lee sobre el
      // fondo oscuro sin que el ícono pierda contraste contra él.
      style={{ backgroundColor: `${tinte}2e`, color: tinte }}
      aria-hidden
    >
      <Icono className={icono} strokeWidth={1.75} />
    </div>
  );
}
