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

/** Las mismas pantallas y en el mismo orden que components/Navigation.tsx. */
const navItems = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/transactions', icon: Receipt, label: 'Transacciones' },
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
        className="absolute top-0 left-0 right-0 bg-slate-900 border-b border-slate-800 z-20 px-4 py-3 flex-row items-center gap-2"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => setMenuAbierto(true)}
          accessibilityLabel="Abrir el menú"
          className="w-8 h-8 bg-emerald-500 rounded-lg items-center justify-center active:bg-emerald-600"
        >
          <Menu size={16} color="#ffffff" />
        </Pressable>
        <Pressable
          onPress={() => setSelectorOpen(true)}
          className="flex-1 flex-row items-center gap-2 bg-slate-800 active:bg-slate-700 rounded-lg px-3 py-1.5"
        >
          {colorDeCuenta ? (
            <View
              className="w-3.5 h-3.5 rounded-sm"
              style={{ backgroundColor: colorDeCuenta.main }}
            />
          ) : (
            <LayoutGrid size={14} color="#94a3b8" />
          )}
          <Texto className="text-sm text-slate-200 flex-1" numberOfLines={1}>
            {currentLedger?.name ?? 'Todas las cuentas'}
          </Texto>
          <ChevronDown size={14} color="#64748b" />
        </Pressable>
      </View>

      {/* Barra de abajo: cinco lugares con el botón central. */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-20 flex-row items-end"
        style={{ paddingBottom: insets.bottom }}
      >
        <Lugar href="/" icono={LayoutDashboard} texto="Dashboard" activa={ruta === '/'} />
        <Lugar href="/transactions" icono={Receipt} texto="Transacciones" activa={ruta === '/transactions'} />

        <View className="flex-1 items-center justify-end pb-2">
          <Pressable
            onPress={() => setGlobalAddOpen(true)}
            accessibilityLabel="Registrar transacción"
            className="w-14 h-14 bg-emerald-500 active:bg-emerald-600 rounded-full items-center justify-center shadow-lg shadow-emerald-500/30 -mt-7"
          >
            <Plus size={28} color="#ffffff" />
          </Pressable>
        </View>

        {/* El asistente, destacado: va en verde apagado aunque no sea la activa. */}
        <Lugar href="/chat" icono={Bot} texto="Asistente" activa={ruta.startsWith('/chat')} destacada />
        <Lugar href="/stats" icono={PieChart} texto="Estadísticas" activa={ruta === '/stats'} />
      </View>

      {/* El menú lateral.
          `Modal` y no una vista absoluta: en React Native una vista hermana no
          se dibuja por encima de todo de forma confiable —el orden manda más
          que el z-index—, y el menú tiene que tapar también las dos barras. */}
      <Modal visible={menuAbierto} transparent animationType="fade" onRequestClose={() => setMenuAbierto(false)}>
        <Pressable className="flex-1 bg-black/60" onPress={() => setMenuAbierto(false)} />
        <View
          className="absolute top-0 left-0 bottom-0 w-[272px] max-w-[82%] bg-slate-900 border-r border-slate-800"
          style={{ maxWidth: '82%' }}
        >
          <View className="bg-emerald-500 px-5" style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center gap-2 py-5">
              <Wallet size={20} color="#ffffff" />
              <Texto className="text-lg text-white flex-1">
                <Texto className="text-lg text-white font-bold">Jobidai</Texto> Wallet
              </Texto>
              <Pressable
                onPress={() => setMenuAbierto(false)}
                accessibilityLabel="Cerrar el menú"
                className="p-1 -mr-1"
              >
                <X size={20} color="rgba(255,255,255,0.8)" />
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
                      activa ? 'bg-emerald-500/10' : 'active:bg-slate-800'
                    }`}
                  >
                    <Icono size={20} color={activa ? '#34d399' : '#cbd5e1'} />
                    <Texto className={`text-sm ${activa ? 'text-emerald-400 font-medium' : 'text-slate-300'}`}>
                      {label}
                    </Texto>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>

          <View
            className="p-3 border-t border-slate-800 gap-2"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Pressable
              onPress={salir}
              className="w-full py-3 bg-emerald-500 active:bg-emerald-600 rounded-lg flex-row items-center justify-center gap-2"
            >
              <LogOut size={16} color="#ffffff" />
              <Texto className="text-white text-sm font-medium">Cerrar sesión</Texto>
            </Pressable>
            {email ? (
              <Texto className="text-xs text-slate-500 text-center" numberOfLines={1}>{email}</Texto>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Un lugar de la barra de abajo. */
function Lugar({ href, icono: Icono, texto, activa, destacada }: {
  href: string;
  icono: typeof LayoutDashboard;
  texto: string;
  activa: boolean;
  destacada?: boolean;
}) {
  const color = activa ? '#34d399' : destacada ? 'rgba(110,231,183,0.7)' : '#94a3b8';
  return (
    <Link href={href as never} asChild>
      <Pressable className="flex-1 items-center justify-center py-3 gap-1">
        <Icono size={20} color={color} />
        <Texto className="text-xs" style={{ color }}>{texto}</Texto>
      </Pressable>
    </Link>
  );
}
