import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Link, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bot, ChevronDown, HandCoins, LayoutDashboard, LayoutGrid, LogOut, Mail, Menu,
  PieChart, Plus, Receipt, Settings, ShoppingCart, Target, Wallet, WalletCards, X,
} from 'lucide-react-native';
import Texto from './Texto';
import { useCuenta } from './ContextoDeCuenta';
import { useSesion } from './ContextoDeSesion';
import { supabase } from '../lib/supabase';
import { LEDGER_COLOR_MAP } from '@compartido/types';
import { useColores } from '../lib/colores';

/** Las mismas pantallas y en el mismo orden que components/Navigation.tsx. */
const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Inicio' },
  { href: '/transactions', icon: Receipt, label: 'Movimientos' },
  { href: '/stats', icon: PieChart, label: 'Estadísticas' },
  { href: '/shopping', icon: ShoppingCart, label: 'Supermercado' },
  { href: '/budgets', icon: Target, label: 'Presupuestos' },
  { href: '/debts', icon: HandCoins, label: 'Deudas' },
  { href: '/cards', icon: WalletCards, label: 'Billetera' },
  { href: '/chat', icon: Bot, label: 'Asistente' },
  { href: '/email', icon: Mail, label: 'Correo' },
  { href: '/settings', icon: Settings, label: 'Configuración' },
] as const;

/**
 * El dashboard va exacto y el resto por prefijo: estando en el detalle de una
 * tarjeta (`/cards/<id>`), su sección tiene que seguir marcada en el menú.
 */
function esActiva(ruta: string, href: string): boolean {
  return href === '/' ? ruta === '/' : ruta.startsWith(href);
}

/**
 * La navegación del teléfono: barra de arriba, barra de abajo y menú lateral.
 *
 * Del componente de la web se porta SOLO la mitad de móvil. La otra mitad
 * —la barra lateral de escritorio, todo lo que cuelga de `md:`— no tiene dónde
 * aparecer: un teléfono nunca llega a los 640px donde ese punto de corte se
 * activa, así que en la web tampoco se ve. Portarla sería código muerto.
 *
 * Las barras van superpuestas al contenido, como en la web, y no como filas de
 * una columna flex. Se ve igual de las dos formas, pero con flex las pantallas
 * tendrían que perder su `pt-14` y su `pb-32` — y entonces sus clases dejarían
 * de ser las mismas que las de la web, que es justamente lo que se quiere
 * conservar.
 */
export default function Navegacion() {
  const paleta = useColores();
  const ruta = usePathname();
  const router = useRouter();
  const { currentLedger, setSelectorOpen, setGlobalAddOpen } = useCuenta();
  const { session } = useSesion();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const insets = useSafeAreaInsets();

  // Al navegar el menú tiene que irse solo: si no, tapa la pantalla recién
  // abierta y hay que cerrarlo a mano.
  useEffect(() => { setMenuAbierto(false); }, [ruta]);

  const email = session?.user?.email ?? '';
  const colorDeCuenta = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;

  const salir = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <>
      {/* Barra de arriba, con el selector de cuenta. */}
      <View
        className="absolute top-0 left-0 right-0 bg-fondo border-b border-linea z-20 px-3 py-2.5 flex-row items-center gap-1"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable
          onPress={() => setMenuAbierto(true)}
          accessibilityLabel="Abrir el menú"
          className="w-9 h-9 rounded-lg items-center justify-center active:bg-hundido"
        >
          <Menu size={20} color={paleta.tinta} />
        </Pressable>
        {/* Se lee como el título de la pantalla y se toca para cambiar de
            cuenta: sin caja alrededor, que la hacía parecer un campo de texto. */}
        <Pressable
          onPress={() => setSelectorOpen(true)}
          className="flex-row items-center gap-2 active:bg-hundido rounded-lg px-2 py-1.5 flex-shrink"
        >
          {colorDeCuenta ? (
            <View className="w-3 h-3 rounded" style={{ backgroundColor: colorDeCuenta.main }} />
          ) : (
            <LayoutGrid size={14} color={paleta.tinta2} />
          )}
          <Texto className="text-sm font-medium text-tinta flex-shrink" numberOfLines={1}>
            {currentLedger?.name ?? 'Todas las cuentas'}
          </Texto>
          <ChevronDown size={14} color={paleta.tinta2} />
        </Pressable>
      </View>

      {/* Barra de abajo: cuatro lugares y el botón de registrar al medio. */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-fondo border-t border-linea z-20 flex-row items-center"
        style={{ paddingBottom: insets.bottom }}
      >
        <Lugar href="/" icono={LayoutDashboard} texto="Inicio" activa={ruta === '/'} />
        <Lugar href="/transactions" icono={Receipt} texto="Movimientos" activa={ruta === '/transactions'} />

        <View className="flex-1 items-center py-2">
          <Pressable
            onPress={() => setGlobalAddOpen(true)}
            accessibilityLabel="Registrar movimiento"
            className="w-11 h-11 bg-primario active:bg-primario/85 rounded-lg items-center justify-center"
          >
            <Plus size={24} color={paleta.sobrePrimario} />
          </Pressable>
        </View>

        <Lugar href="/chat" icono={Bot} texto="Asistente" activa={ruta.startsWith('/chat')} />
        <Lugar href="/stats" icono={PieChart} texto="Estadísticas" activa={ruta === '/stats'} />
      </View>

      {/* El menú lateral.
          `Modal` y no una vista absoluta: en React Native una vista hermana no
          se dibuja por encima de todo de forma confiable —el orden manda más
          que el z-index—, y el menú tiene que tapar también las dos barras. */}
      <Modal visible={menuAbierto} transparent animationType="fade" onRequestClose={() => setMenuAbierto(false)}>
        <Pressable className="flex-1 bg-black/60" onPress={() => setMenuAbierto(false)} />
        <View
          className="absolute top-0 left-0 bottom-0 w-[272px] max-w-[82%] bg-panel border-r border-linea"
          style={{ maxWidth: '82%' }}
        >
          <View className="px-5 border-b border-linea" style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center gap-2 py-4">
              <View className="w-6 h-6 bg-primario rounded-md items-center justify-center">
                <Wallet size={14} color={paleta.sobrePrimario} />
              </View>
              <Texto className="text-base font-semibold text-tinta flex-1">Jobidai Wallet</Texto>
              <Pressable
                onPress={() => setMenuAbierto(false)}
                accessibilityLabel="Cerrar el menú"
                className="p-1 -mr-1"
              >
                <X size={20} color={paleta.tinta2} />
              </Pressable>
            </View>
          </View>

          {/* Con tantas pantallas ya no entran todas en un teléfono chico. */}
          <ScrollView className="flex-1" contentContainerClassName="p-3 gap-1">
            {navItems.map(({ href, icon: Icono, label }) => {
              const activa = esActiva(ruta, href);
              return (
                <Link key={href} href={href as never} asChild>
                  <Pressable
                    onPress={() => setMenuAbierto(false)}
                    className={`flex-row items-center gap-3 px-3 py-3 rounded-lg ${
                      activa ? 'bg-hundido' : 'active:bg-hundido'
                    }`}
                  >
                    <Icono size={20} color={activa ? paleta.tinta : paleta.tinta2} />
                    <Texto className={`text-sm ${activa ? 'text-tinta font-medium' : 'text-tinta-2'}`}>
                      {label}
                    </Texto>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>

          <View
            className="p-3 border-t border-linea gap-2"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={salir}
              className="w-full py-3 active:bg-hundido rounded-lg flex-row items-center justify-center gap-2"
            >
              <LogOut size={16} color={paleta.tinta2} />
              <Texto className="text-tinta-2 text-sm font-medium">Cerrar sesión</Texto>
            </Pressable>
            {email ? (
              <Texto className="text-xs text-tinta-2 text-center" numberOfLines={1}>{email}</Texto>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Un lugar de la barra de abajo: activo en tinta, el resto en gris. */
function Lugar({ href, icono: Icono, texto, activa }: {
  href: string;
  icono: typeof LayoutDashboard;
  texto: string;
  activa: boolean;
}) {
  const paleta = useColores();
  const color = activa ? paleta.tinta : paleta.tinta2;
  return (
    <Link href={href as never} asChild>
      <Pressable className="flex-1 items-center justify-center py-2.5 gap-1">
        <Icono size={20} color={color} />
        <Texto className="text-2xs font-medium" style={{ color }}>{texto}</Texto>
      </Pressable>
    </Link>
  );
}
