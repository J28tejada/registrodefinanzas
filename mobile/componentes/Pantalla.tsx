import { ScrollView, ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * El alto de la barra de arriba sin contar el área segura: `py-3` más el botón
 * de 32px, que es lo que le da a la web sus `pt-14` (56px).
 */
export const ALTO_DE_LA_BARRA = 56;

/**
 * El alto de la barra de abajo, sin contar el área segura.
 *
 * `py-3` más el ícono y su etiqueta. Es el mismo número que la web explica en
 * su `pb-32`: "la barra inferior mide ~77px y flota sobre el contenido". Acá
 * hace falta escrito para las pantallas que NO scrollean —la conversación del
 * asistente—, donde el campo de escribir tiene que apoyarse justo encima.
 */
export const ALTO_DE_LA_BARRA_DE_ABAJO = 77;

/**
 * El contenedor de una pantalla con navegación. El gemelo del `<main>` de
 * components/AppShell.tsx, que allá lleva `p-4 pb-32`.
 *
 * Existe por dos cosas que cada pantalla estaba resolviendo por su cuenta, y
 * mal:
 *
 * 1. El `p-4` del `<main>` no se había portado: las pantallas llevaban solo el
 *    `pt-14 pb-32`, así que en el teléfono el contenido quedaba pegado a los
 *    dos bordes y 16px más arriba que en la web. Un corrimiento parejo en todos
 *    los bloques, que es la firma de un contenedor que falta.
 * 2. El `pt-14` es un número fijo, y el alto real de la barra de arriba no lo
 *    es: en un teléfono con muesca la barra mide `insets.top + 56`, así que los
 *    56px de `pt-14` metían la primera línea de cada pantalla DEBAJO de la
 *    barra. En la web no pasa porque ahí no hay muesca que descontar.
 *
 * El relleno va en el contenedor del contenido y no en un `View` de afuera a
 * propósito: puesto afuera recorta el área que scrollea y queda una franja
 * muerta contra las barras. Es la misma razón por la que `Estructura` no lo
 * pone.
 */
export default function Pantalla({
  className = '', children, ...resto
}: ScrollViewProps & { className?: string }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1"
      /*
       * El relleno de arriba va por `style` y el resto por clases: es el único
       * que depende del aparato. NativeWind junta los dos —lo que sale de
       * `contentContainerClassName` y lo que llega por `contentContainerStyle`
       * se fusionan— y acá no se pisan, porque tocan propiedades distintas.
       */
      contentContainerStyle={{ paddingTop: insets.top + ALTO_DE_LA_BARRA + 16 }}
      contentContainerClassName={`px-4 pb-32 ${className}`}
      // Arrastrar la pantalla hacia abajo cierra el teclado, como en iOS.
      keyboardDismissMode="interactive"
      {...resto}
    >
      {children}
    </ScrollView>
  );
}
