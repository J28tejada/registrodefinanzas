import { StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector } from 'react-native-gesture-handler';
import { useColores } from '../lib/colores';
import Navegacion from './Navegacion';
import { useMenuLateral } from './MenuLateral';
import BarraDelTeclado from './BarraDelTeclado';

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

/**
 * El fondo liso con la luz que baja desde arriba: el mismo degradé del `body`
 * de la web. Detrás de todo, para que el vidrio tenga algo que dejar ver.
 */
function Fondo() {
  const paleta = useColores();
  return (
    <LinearGradient
      colors={[paleta.fondoLuz, paleta.fondo]}
      locations={[0, 0.55]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}

export default function Estructura({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const desnuda = SIN_NAVEGACION.some(p => ruta.startsWith(p));
  const menu = useMenuLateral();

  /*
   * `p-4` también en las desnudas: la web las envuelve en
   * `<main className="min-h-screen p-4">` y sin reproducirlo todo el contenido
   * queda 16px a la izquierda y 16px más arriba que en la web. Lo encontró la
   * comparación de geometría, que mostraba un Δx de -16 constante en TODOS los
   * bloques de la galería — un corrimiento parejo es siempre un contenedor de
   * más o de menos, no un problema de la pantalla.
   */
  if (desnuda) {
    return (
      <View className="flex-1 bg-fondo">
        <Fondo />
        <View className="flex-1 p-4">{children}</View>
        <BarraDelTeclado />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-fondo">
      <Fondo />
      {/* Deslizar de izquierda a derecha sobre cualquier pantalla abre el menú. */}
      <GestureDetector gesture={menu.gestoParaAbrir}>
        <View className="flex-1">{children}</View>
      </GestureDetector>
      <Navegacion menu={menu} />
      <BarraDelTeclado />
    </View>
  );
}
