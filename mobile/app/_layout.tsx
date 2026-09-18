import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RaizDelLayout() {
  return (
    <SafeAreaProvider>
      {/* Sin cabecera propia: la app web dibuja la suya y hay que reproducir esa,
          no la de iOS. `contentStyle` pone el mismo slate-950 del <body>. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0f172a' } }} />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
