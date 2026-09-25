import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Svg, { Path } from 'react-native-svg';
import { AlertCircle, CheckCircle2, Loader2, Mail, Wallet } from 'lucide-react-native';
import Texto from '../componentes/Texto';
import { estaConfigurado, supabase } from '../lib/supabase';
import { traducirErrorDeAuth } from '@compartido/mensajes-de-auth';
import { useColores } from '../lib/colores';

type Modo = 'entrar' | 'registrarse';

/** El gemelo de app/login/page.tsx. */
export default function Login() {
  const paleta = useColores();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const destino = next || '/';

  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [cargandoGoogle, setCargandoGoogle] = useState(false);
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  /*
   * Los botones apagados se dibujan a mano, no con `disabled:opacity-50`.
   *
   * En la web esa variante es un selector sobre el atributo `disabled` de un
   * <button>. Un Pressable no es un <button>, y la variante no siempre llega:
   * el botón de Google quedaba blanco y brillante cuando tendría que verse
   * apagado. Comparado contra la web, la diferencia salta.
   */
  const apagado = (lo: boolean) => (lo ? { opacity: 0.5 } : undefined);

  const enviar = async () => {
    setCargando(true);
    setError('');
    setConfirmar(false);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(destino as never);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: makeRedirectUri({ path: 'auth' }) },
        });
        if (error) throw error;
        // Con confirmación por correo activada, la sesión viene vacía.
        if (data.session) router.replace(destino as never);
        else setConfirmar(true);
      }
    } catch (err) {
      setError(traducirErrorDeAuth(err));
    } finally {
      setCargando(false);
    }
  };

  /**
   * Google, por el navegador del sistema y de vuelta por enlace profundo.
   *
   * En la web alcanza con redirigir la pestaña y Supabase se encarga del resto.
   * Acá hay que abrir el navegador, esperar a que vuelva con el código en la URL
   * y canjearlo a mano: no hay pestaña que redirigir ni cookie que leer.
   */
  const entrarConGoogle = async () => {
    setCargandoGoogle(true);
    setError('');
    try {
      const redirectTo = makeRedirectUri({ path: 'auth' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Supabase no devolvió a dónde ir.');

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') {
        // Cerró el navegador sin entrar: no es un error que haya que mostrar.
        setCargandoGoogle(false);
        return;
      }

      const codigo = new URL(res.url).searchParams.get('code');
      if (!codigo) throw new Error('La respuesta de Google no traía el código.');
      const { error: errCanje } = await supabase.auth.exchangeCodeForSession(codigo);
      if (errCanje) throw errCanje;
      router.replace(destino as never);
    } catch (err) {
      setError(traducirErrorDeAuth(err));
      setCargandoGoogle(false);
    }
  };

  // El `p-4` que envuelve esto lo pone Estructura, igual que el <main> de la
  // web. Acá solo queda el centrado dentro del `min-h-[80vh]`, que es lo que
  // hace la pantalla de la web: centrar contra la pantalla entera parece lo
  // mismo y deja la tarjeta casi cien píxeles más abajo.
  return (
    <View className="flex-1 bg-fondo">
      <View className="min-h-[80vh] items-center justify-center px-4">
        <View className="w-full max-w-sm gap-6">
        <View className="items-center gap-3">
          <View className="w-12 h-12 bg-primario rounded-lg items-center justify-center">
            <Wallet size={24} color={paleta.sobrePrimario} />
          </View>
          <View className="items-center">
            <Texto className="text-xl font-semibold text-tinta">Jobidai Wallet</Texto>
            <Texto className="text-sm text-tinta-2">
              {modo === 'entrar' ? 'Entrá a tu cuenta' : 'Creá tu cuenta'}
            </Texto>
          </View>
        </View>

        {!estaConfigurado ? (
          <View className="flex-row items-start gap-2 bg-aviso/10 border border-aviso/20 rounded-xl px-4 py-3">
            <View className="mt-0.5"><AlertCircle size={16} color={paleta.aviso} /></View>
            <Texto className="text-aviso text-sm flex-1">
              Faltan <Texto className="text-aviso text-sm font-mono">EXPO_PUBLIC_SUPABASE_URL</Texto> y{' '}
              <Texto className="text-aviso text-sm font-mono">EXPO_PUBLIC_SUPABASE_ANON_KEY</Texto>.
              Sin eso no hay forma de iniciar sesión.
            </Texto>
          </View>
        ) : null}

        {error ? (
          <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
            <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
            <Texto className="text-peligro text-sm flex-1">{error}</Texto>
          </View>
        ) : null}

        {confirmar ? (
          <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 items-center gap-3">
            <CheckCircle2 size={32} color={paleta.acento} />
            <Texto className="text-sm text-tinta font-medium">Revisá tu correo</Texto>
            <Texto className="text-xs text-tinta-2 text-center">
              Te mandamos un enlace a <Texto className="text-tinta">{email}</Texto> para
              confirmar la cuenta. Después de abrirlo podés entrar.
            </Texto>
          </View>
        ) : (
          <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-5 gap-4">
            <Pressable
              onPress={entrarConGoogle}
              disabled={cargandoGoogle || cargando || !estaConfigurado}
              style={apagado(cargandoGoogle || cargando || !estaConfigurado)}
              className="w-full py-3 bg-panel border border-t-borde-luz border-linea-fuerte active:bg-presionado rounded-2xl flex-row items-center justify-center gap-2.5"
            >
              {cargandoGoogle
                ? <ActivityIndicator size="small" color={paleta.tinta2} />
                : <LogoDeGoogle />}
              <Texto className="text-tinta text-sm font-medium">Continuar con Google</Texto>
            </Pressable>

            <View className="flex-row items-center gap-3">
              <View className="flex-1 h-px bg-hundido" />
              <Texto className="text-xs text-tinta-2">o con tu correo</Texto>
              <View className="flex-1 h-px bg-hundido" />
            </View>

            <View className="gap-1.5">
              <Texto className="text-xs leading-6 text-tinta-2">Correo</Texto>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="vos@ejemplo.com"
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-3 focus:border-tinta-3"
                style={{ fontFamily: 'Inter_400Regular' }}
              />
            </View>

            <View className="gap-1.5">
              <Texto className="text-xs leading-6 text-tinta-2">Contraseña</Texto>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                placeholder="Mínimo 6 caracteres"
                onSubmitEditing={enviar}
                className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta placeholder:text-tinta-3 focus:border-tinta-3"
                style={{ fontFamily: 'Inter_400Regular' }}
              />
            </View>

            <Pressable
              onPress={enviar}
              disabled={cargando || cargandoGoogle || !estaConfigurado}
              style={apagado(cargando || cargandoGoogle || !estaConfigurado)}
              className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
            >
              {cargando
                ? <ActivityIndicator size="small" color={paleta.sobrePrimario} />
                : <Mail size={16} color={paleta.sobrePrimario} />}
              <Texto className="text-sobre-primario text-sm font-medium">
                {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
              </Texto>
            </Pressable>

            <Pressable
              onPress={() => { setModo(modo === 'entrar' ? 'registrarse' : 'entrar'); setError(''); }}
              className="w-full"
            >
              <Texto className="text-xs text-tinta-2 text-center">
                {modo === 'entrar' ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Entrá'}
              </Texto>
            </Pressable>
          </View>
        )}
        </View>
      </View>
    </View>
  );
}

/** El mismo logo que la web, que lo trae como SVG en línea. */
function LogoDeGoogle() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}
