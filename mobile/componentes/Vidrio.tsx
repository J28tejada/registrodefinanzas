import { Platform, StyleSheet, useColorScheme, View, ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';

/**
 * Una hoja de vidrio: lo que pasa por debajo se ve desenfocado.
 *
 * El gemelo de la clase `.vidrio` de app/globals.css. Va en lo que tiene
 * contenido detrás —las barras, el menú lateral, las hojas y los modales—; las
 * tarjetas usan `bg-panel` a secas, porque detrás solo tienen el fondo liso.
 *
 * Tres capas, en este orden: el desenfoque del sistema, encima el color del
 * tema (`bg-panel`, translúcido) y encima el contenido. El color va arriba del
 * desenfoque y no en el contenedor: si no, lo desenfoca a él también y cada
 * tinte de `BlurView` le suma el suyo, con lo que el tono ya no sale de
 * `tema.json` y deja de coincidir con la web.
 *
 * En Android el desenfoque de Expo es experimental y caro: ahí va solo el color,
 * más tapado, para que el texto no quede encima de lo que pasa por debajo.
 */
export default function Vidrio({ className = '', children, ...resto }: ViewProps & { className?: string }) {
  const oscuro = useColorScheme() === 'dark';
  const conDesenfoque = Platform.OS !== 'android';

  return (
    <View className={`overflow-hidden ${className}`} {...resto}>
      {conDesenfoque ? (
        <BlurView tint={oscuro ? 'dark' : 'light'} intensity={40} style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        className={conDesenfoque ? 'bg-panel' : 'bg-panel-fuerte'}
      />
      {children}
    </View>
  );
}
