import { View } from 'react-native';
import { usePathname } from 'expo-router';
import Navegacion from './Navegacion';

/**
 * El gemelo de components/AppShell.tsx.
 *
 * El `p-4 pb-32` de la web NO va acá: va en el `contentContainerClassName` del
 * ScrollView de cada pantalla. Puesto en este contenedor recorta el área que
 * scrollea en vez de dejar pasar el contenido por debajo, y queda una franja
 * muerta encima de la barra de abajo. En la web esas clases están en el <main>,
 * que es el que scrollea; acá el que scrollea es el ScrollView.
 *
 * `md:ml-60` y `md:p-6` no se portan: son de la barra lateral de escritorio, y
 * un teléfono nunca llega al ancho donde ese punto de corte se activa.
 */
const SIN_NAVEGACION = ['/login', '/auth', '/galeria', '/formato'];

export default function Estructura({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const desnuda = SIN_NAVEGACION.some(p => ruta.startsWith(p));

  /*
   * `p-4` también en las desnudas: la web las envuelve en
   * `<main className="min-h-screen p-4">` y sin reproducirlo todo el contenido
   * queda 16px a la izquierda y 16px más arriba que en la web. Lo encontró la
   * comparación de geometría, que mostraba un Δx de -16 constante en TODOS los
   * bloques de la galería — un corrimiento parejo es siempre un contenedor de
   * más o de menos, no un problema de la pantalla.
   */
  if (desnuda) return <View className="flex-1 bg-slate-950 p-4">{children}</View>;

  return (
    <View className="flex-1 bg-slate-950">
      <View className="flex-1">{children}</View>
      <Navegacion />
    </View>
  );
}
