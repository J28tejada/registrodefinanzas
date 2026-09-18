import { View } from 'react-native';
import { colorDeCategoria } from '@compartido/categorias-catalogo';
import { TransactionType } from '@compartido/types';
import { iconoDeCategoria } from '../lib/iconos-categoria';

const TAMANOS = {
  sm: { caja: 'w-8 h-8', icono: 16 },
  md: { caja: 'w-11 h-11', icono: 20 },
  lg: { caja: 'w-14 h-14', icono: 24 },
} as const;

/**
 * El ícono de una categoría, en su color. El gemelo de components/CategoryIcon.tsx.
 *
 * La diferencia con la web: allá el color del ícono se hereda por `currentColor`
 * desde la clase del contenedor, y acá un SVG no hereda nada del texto — hay que
 * pasarle el color por prop. Lo mismo vale para el tamaño: en la web es una clase
 * (`w-4 h-4`) y acá es un número.
 */
export default function IconoDeCategoria({
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
    <View
      className={`${caja} rounded-full items-center justify-center ${className}`}
      // El mismo color al 18%, igual que en la web: el círculo se lee sobre el
      // fondo oscuro sin que el ícono pierda contraste contra él.
      style={{ backgroundColor: `${tinte}2e` }}
    >
      <Icono size={icono} color={tinte} strokeWidth={1.75} />
    </View>
  );
}
