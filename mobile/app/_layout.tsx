import '../global.css';
import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts,
} from '@expo-google-fonts/inter';
import { ProveedorDeSesion, useSesion } from '../componentes/ContextoDeSesion';
import { ProveedorDeAjustes } from '../componentes/ContextoDeAjustes';
import { ProveedorDeCuenta, useCuenta } from '../componentes/ContextoDeCuenta';
import { ProveedorDeCategorias } from '../componentes/ContextoDeCategorias';
import ModalDeMovimiento from '../componentes/ModalDeMovimiento';
import SelectorDeCuenta from '../componentes/SelectorDeCuenta';
import Estructura from '../componentes/Estructura';

// Que la pantalla de arranque no se vaya antes de tener la tipografía: si se
// fuera, la app se dibujaría un instante con la fuente del sistema y saltaría
// al cargar Inter.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Las pantallas que se pueden ver sin sesión. El gemelo de PUBLICAS en middleware.ts. */
const PUBLICAS = ['login', 'unirse', 'galeria', 'formato', 'vista-previa'];

export default function RaizDelLayout() {
  const [listas] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  useEffect(() => { if (listas) SplashScreen.hideAsync().catch(() => {}); }, [listas]);
  if (!listas) return null;

  return (
    // Sin esta raíz los gestos de Gesture Handler no hacen nada, y sin error.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* El mismo orden que app/providers.tsx en la web: las categorías cuelgan
            de la cuenta activa, así que el proveedor de cuenta va primero. */}
        <ProveedorDeSesion>
          <ProveedorDeAjustes>
            <ProveedorDeCuenta>
              <ProveedorDeCategorias>
                <Guardia />
                <ModalGlobalDeMovimiento />
                <SelectorDeCuenta />
              </ProveedorDeCategorias>
            </ProveedorDeCuenta>
          </ProveedorDeAjustes>
        </ProveedorDeSesion>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * El modal de registrar un movimiento, uno solo para toda la app.
 *
 * El gemelo de `GlobalAddModal` en app/providers.tsx, y por la misma razón que
 * allá: el botón + de la barra de abajo vive en la navegación, que está en
 * todas las pantallas, así que el modal que abre no puede colgar de ninguna.
 *
 * Acá hay además un motivo que la web no tiene: un `Modal` de React Native se
 * dibuja sobre la pantalla entera, y dos abiertos a la vez —el de una pantalla
 * y el del botón +— se tapan entre ellos. Uno solo, en la raíz.
 */
function ModalGlobalDeMovimiento() {
  const {
    globalAddOpen, setGlobalAddOpen, movimientoEnEdicion,
    notifyTransactionSaved, refreshLedgers,
  } = useCuenta();
  if (!globalAddOpen) return null;
  return (
    <ModalDeMovimiento
      visible={globalAddOpen}
      onClose={() => setGlobalAddOpen(false)}
      onGuardado={() => { notifyTransactionSaved(); refreshLedgers(); }}
      editando={movimientoEnEdicion}
    />
  );
}

/**
 * Manda al login a quien no tenga sesión, y al tablero a quien la tenga.
 *
 * Es lo que hacía `middleware.ts` en la web, del lado del servidor. Acá vive en
 * el cliente porque no hay otro lado: la protección real de los datos no es
 * esto sino RLS, que corre en la base y no se puede esquivar borrando una
 * condición de JavaScript.
 */
/**
 * El tema de React Navigation, con el fondo transparente.
 *
 * Cada pantalla de la pila nativa pinta debajo el fondo de su tema, y el de por
 * defecto es un gris claro (#F2F2F2) que no sabe nada de claro u oscuro: con el
 * teléfono en oscuro, los textos claros quedaban sobre ese gris y no se leían.
 * Transparente, se ve el `bg-fondo` de Estructura, que sí cambia con el tema.
 */
const TEMA_DE_NAVEGACION = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

function Guardia() {
  const { session, listo } = useSesion();
  const segmentos = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!listo) return;
    const enPublica = PUBLICAS.includes(segmentos[0] ?? '');
    if (!session && !enPublica) router.replace('/login');
    else if (session && segmentos[0] === 'login') router.replace('/');
  }, [session, listo, segmentos, router]);

  return (
    <Estructura>
      {/* Sin cabecera propia: la app web dibuja la suya y hay que reproducir
          esa, no la de iOS. El fondo transparente deja ver el `bg-fondo` de
          Estructura: con un color puesto acá desde JavaScript, al pasar el
          teléfono de claro a oscuro con la app abierta el fondo se quedaba en
          el tema anterior mientras todo lo demás cambiaba. */}
      <ThemeProvider value={TEMA_DE_NAVEGACION}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
      </ThemeProvider>
    </Estructura>
  );
}
