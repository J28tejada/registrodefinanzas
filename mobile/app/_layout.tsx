import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts,
} from '@expo-google-fonts/inter';
import { ProveedorDeSesion, useSesion } from '../componentes/ContextoDeSesion';
import { ProveedorDeAjustes } from '../componentes/ContextoDeAjustes';
import { ProveedorDeCuenta } from '../componentes/ContextoDeCuenta';
import { ProveedorDeCategorias } from '../componentes/ContextoDeCategorias';
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
    <SafeAreaProvider>
      {/* El mismo orden que app/providers.tsx en la web: las categorías cuelgan
          de la cuenta activa, así que el proveedor de cuenta va primero. */}
      <ProveedorDeSesion>
        <ProveedorDeAjustes>
          <ProveedorDeCuenta>
            <ProveedorDeCategorias>
              <Guardia />
            </ProveedorDeCategorias>
          </ProveedorDeCuenta>
        </ProveedorDeAjustes>
      </ProveedorDeSesion>
      <StatusBar style="light" />
    </SafeAreaProvider>
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
          esa, no la de iOS. `contentStyle` pone el mismo slate-950 del <body>. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }} />
    </Estructura>
  );
}
