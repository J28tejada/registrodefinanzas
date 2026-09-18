import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts,
} from '@expo-google-fonts/inter';

// Que la pantalla de arranque no se vaya antes de tener la tipografía: si se
// fuera, la app se dibujaría un instante con la fuente del sistema y saltaría
// al cargar Inter.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RaizDelLayout() {
  const [listas] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  useEffect(() => { if (listas) SplashScreen.hideAsync().catch(() => {}); }, [listas]);

  if (!listas) return null;

  return (
    <SafeAreaProvider>
      {/* Sin cabecera propia: la app web dibuja la suya y hay que reproducir esa,
          no la de iOS. `contentStyle` pone el mismo slate-950 del <body>. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }} />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
