import { Slot, usePathname } from 'expo-router';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bot, MessageCircle, Send } from 'lucide-react-native';
import Texto from '../../componentes/Texto';
import { ALTO_DE_LA_BARRA, ALTO_DE_LA_BARRA_DE_ABAJO } from '../../componentes/Pantalla';

/**
 * El gemelo de app/chat/layout.tsx.
 *
 * Los tres lugares donde vive el mismo asistente. Antes eran tres entradas
 * sueltas en el menú, y eso hacía pensar que había tres asistentes distintos. Es
 * uno solo: el de acá, el de WhatsApp y el de Telegram anotan en las mismas
 * cuentas y contestan lo mismo. Lo único que cambia es por dónde se le habla.
 */
const CANALES = [
  { href: '/chat', icon: Bot, label: 'En la app' },
  { href: '/chat/whatsapp', icon: MessageCircle, label: 'WhatsApp' },
  { href: '/chat/telegram', icon: Send, label: 'Telegram' },
];

export default function AsistenteLayout() {
  const ruta = usePathname();
  const insets = useSafeAreaInsets();

  /*
   * El relleno va acá y no en cada pestaña porque la barra es de las tres.
   * Es el mismo que pone `Pantalla`: el alto real de la barra de arriba —que
   * depende de la muesca— más los 16px del `p-4` que la web le da al <main>.
   *
   * El `h-[calc(100dvh-8rem)]` de la web no se porta: allá sirve para que la
   * conversación termine donde termina la ventana del navegador, contando la
   * barra de direcciones. Acá `flex-1` ya se queda con lo que sobra, que es
   * exactamente lo mismo sin tener que restar nada a mano.
   */
  return (
    <View
      className="flex-1 px-4"
      style={{
        paddingTop: insets.top + ALTO_DE_LA_BARRA + 16,
        // Y por abajo, el alto de la barra de navegación: es absoluta y flota
        // sobre el contenido, así que sin esto el campo de escribir le queda
        // debajo. La web lo resuelve restándoselo al alto de la conversación.
        //
        // Va en el contenedor y no en el `contentContainer` de cada pestaña —al
        // revés de lo que hace `Pantalla`— porque la conversación NO scrollea
        // como una página: el campo de escribir es lo último y tiene que
        // apoyarse siempre justo encima de la barra, esté donde esté el scroll.
        paddingBottom: insets.bottom + ALTO_DE_LA_BARRA_DE_ABAJO,
      }}
    >
      <View className="flex-row gap-1 bg-panel border border-t-borde-luz border-linea rounded-2xl p-1 mb-4">
        {CANALES.map(({ href, icon: Icono, label }) => {
          // Exacto y no por prefijo: `/chat` es prefijo de los otros dos, y por
          // prefijo quedarían las tres marcadas a la vez.
          const activo = ruta === href;
          return (
            <Link key={href} href={href as never} asChild>
              <Pressable
                className={`flex-1 flex-row items-center justify-center gap-1.5 px-2 py-2 rounded-lg ${
                  activo ? 'bg-hundido' : 'active:bg-hundido'
                }`}
              >
                {/* El ícono no se dibuja, igual que en la web debajo de 640px:
                    con los tres puestos, "Telegram" no entra en un teléfono
                    angosto y hay que scrollear la barra para encontrarlo. */}
                <Texto className={`text-sm ${activo ? 'text-tinta font-medium' : 'text-tinta-2'}`}>
                  {label}
                </Texto>
              </Pressable>
            </Link>
          );
        })}
      </View>

      <Slot />
    </View>
  );
}
