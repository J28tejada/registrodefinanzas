import { useEffect } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import type { MenuLateral } from './MenuLateral';
import Vidrio from './Vidrio';

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
export default function Navegacion({ menu }: { menu: MenuLateral }) {
  const paleta = useColores();
  const ruta = usePathname();
  const router = useRouter();
  const { currentLedger, setSelectorOpen, setGlobalAddOpen } = useCuenta();
  const { session } = useSesion();
  const insets = useSafeAreaInsets();
  const { cerrarYa, cerrar, visible } = menu;

  // Al navegar el menú tiene que irse solo: si no, tapa la pantalla recién
  // abierta y hay que cerrarlo a mano.
  useEffect(() => { cerrarYa(); }, [ruta, cerrarYa]);

  // El botón de atrás de Android cierra el menú antes que la pantalla. Con el
  // `Modal` lo hacía `onRequestClose`; la capa animada tiene que pedirlo.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { cerrar(); return true; });
    return () => sub.remove();
  }, [visible, cerrar]);

  const email = session?.user?.email ?? '';
  const colorDeCuenta = currentLedger ? LEDGER_COLOR_MAP[currentLedger.color] : null;

  const salir = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <>
      {/* Barra de arriba, con el selector de cuenta. */}
      <Vidrio
        className="absolute top-0 left-0 right-0 border-b border-linea z-20 px-3 py-2.5 flex-row items-center gap-1"
        style={{ paddingTop: insets.top + 10 }}
      >
        <Pressable
          onPress={menu.abrir}
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
      </Vidrio>

      {/* Barra de abajo: cuatro lugares y el botón de registrar al medio.
          Flota separada del borde, como la de la web, y sube si el teléfono
          tiene barra de gestos. */}
      <Vidrio
        className="absolute left-3 right-3 border border-t-borde-luz border-linea rounded-2xl z-20 flex-row items-center"
        style={{ bottom: Math.max(insets.bottom, 12) }}
      >
        <Lugar href="/" icono={LayoutDashboard} texto="Inicio" activa={ruta === '/'} />
        <Lugar href="/transactions" icono={Receipt} texto="Movimientos" activa={ruta === '/transactions'} />

        <View className="flex-1 items-center py-2">
          <Pressable
            onPress={() => setGlobalAddOpen(true)}
            accessibilityLabel="Registrar movimiento"
            className="w-11 h-11 bg-primario active:bg-primario/85 rounded-xl items-center justify-center"
          >
            <Plus size={24} color={paleta.sobrePrimario} />
          </Pressable>
        </View>

        <Lugar href="/chat" icono={Bot} texto="Asistente" activa={ruta.startsWith('/chat')} />
        <Lugar href="/stats" icono={PieChart} texto="Estadísticas" activa={ruta === '/stats'} />
      </Vidrio>

      {/* El menú lateral: una capa encima de todo y no un `Modal`, para poder
          seguir al dedo (ver MenuLateral.ts). Va última a propósito: en React
          Native manda el orden más que el z-index, y así tapa las dos barras.
          Deslizarla hacia la izquierda la cierra. */}
      {visible ? (
        <View style={StyleSheet.absoluteFill} className="z-30" {...menu.gestoParaCerrar.panHandlers}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: menu.progreso }]}>
            <Pressable className="flex-1 bg-black/40" onPress={cerrar} accessibilityLabel="Cerrar el menú" />
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: menu.ancho,
              transform: [{
                translateX: menu.progreso.interpolate({ inputRange: [0, 1], outputRange: [-menu.ancho, 0] }),
              }],
            }}
          >
          <Vidrio className="flex-1 border-r border-linea">
          <View className="px-5 border-b border-linea" style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center gap-2 py-4">
              <View className="w-6 h-6 bg-primario rounded-md items-center justify-center">
                <Wallet size={14} color={paleta.sobrePrimario} />
              </View>
              <Texto className="text-base font-semibold text-tinta flex-1">Jobidai Wallet</Texto>
              <Pressable
                onPress={cerrar}
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
                    onPress={cerrarYa}
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
          </Vidrio>
          </Animated.View>
        </View>
      ) : null}
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
