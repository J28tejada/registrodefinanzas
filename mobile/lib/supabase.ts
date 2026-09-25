// `crypto.getRandomValues` no existe en el motor del teléfono y supabase-js lo
// usa para el flujo de PKCE. Va primero de todo: si se importa después de
// createClient, ya es tarde.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

/**
 * PKCE con SHA-256, no con `plain`.
 *
 * supabase-js arma el desafío con `crypto.subtle.digest`, y Hermes no trae
 * `crypto.subtle`. Sin él no falla: cae a `plain` y avisa con un WARN, que es
 * peor, porque manda el verificador tal cual en la URL que abre el navegador.
 * Quien vea esa URL y atrape el código de vuelta lo puede canjear. Solo se
 * cubre SHA-256 porque es lo único que supabase-js pide.
 */
if (typeof globalThis.crypto?.subtle === 'undefined') {
  Object.assign(globalThis.crypto, {
    subtle: {
      async digest(algoritmo: string, datos: BufferSource) {
        if (algoritmo !== 'SHA-256') throw new Error(`Solo hay SHA-256, no ${algoritmo}.`);
        return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, datos);
      },
    },
  });
}

/**
 * El cliente de Supabase del teléfono.
 *
 * La web usa `@supabase/ssr`, que guarda la sesión en cookies para que el
 * servidor de Next también la vea. Acá no hay cookies ni servidor que mire:
 * `@supabase/ssr` se abandona entero, junto con el middleware y la ruta de
 * callback, que son piezas de la web.
 *
 * Lo que NO cambia es lo que viene después: `lib/db.ts` recibe
 * `{ supabase, userId }` y no le importa de dónde salió el cliente. Por eso las
 * 2100 líneas de la capa de datos se comparten sin tocar una coma.
 */

/** Margen por debajo del límite de ~2048 bytes por valor de SecureStore. */
const TROZO = 1800;

/**
 * Guarda la sesión en el Keychain, partida en pedazos.
 *
 * Dos decisiones, las dos por el mismo motivo:
 *
 * El `refresh_token` es una credencial de larga vida. En AsyncStorage viviría en
 * texto plano —legible en un teléfono rooteado, y copiado al backup de iCloud—,
 * así que va al Keychain con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
 *
 * Y va partida porque una sesión serializada pasa holgadamente los 2048 bytes
 * que admite SecureStore. Guardarla entera falla AL ESCRIBIR, justo después de
 * un login exitoso, así que el síntoma no es "no puedo entrar" sino "entro bien
 * y mañana me vuelve a pedir la contraseña". Es el error clásico de este port y
 * cuesta horas encontrarlo.
 */
const almacenSeguro = {
  async getItem(clave: string) {
    const n = await SecureStore.getItemAsync(`${clave}__n`);
    if (!n) return SecureStore.getItemAsync(clave);
    const partes = await Promise.all(
      Array.from({ length: Number(n) }, (_, i) => SecureStore.getItemAsync(`${clave}__${i}`)),
    );
    // Si falta un pedazo la sesión está rota: mejor null y volver a entrar que
    // un JSON cortado por la mitad.
    return partes.some(p => p == null) ? null : partes.join('');
  },

  async setItem(clave: string, valor: string) {
    await almacenSeguro.removeItem(clave);
    const opciones = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
    if (valor.length <= TROZO) {
      await SecureStore.setItemAsync(clave, valor, opciones);
      return;
    }
    const n = Math.ceil(valor.length / TROZO);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${clave}__${i}`, valor.slice(i * TROZO, (i + 1) * TROZO), opciones);
    }
    // El contador va ÚLTIMO: hasta que exista, una lectura simultánea toma el
    // camino del valor entero y devuelve null en vez de un valor a medio
    // escribir.
    await SecureStore.setItemAsync(`${clave}__n`, String(n), opciones);
  },

  async removeItem(clave: string) {
    const n = await SecureStore.getItemAsync(`${clave}__n`);
    if (n) {
      await Promise.all(
        Array.from({ length: Number(n) }, (_, i) => SecureStore.deleteItemAsync(`${clave}__${i}`)),
      );
      await SecureStore.deleteItemAsync(`${clave}__n`);
    }
    await SecureStore.deleteItemAsync(clave);
  },
};

/**
 * En el navegador no hay Keychain.
 *
 * El export a web existe para comparar las pantallas contra las de la app web,
 * no para usarlo de verdad, así que alcanza con `localStorage` — que es, de
 * hecho, lo que usa supabase-js por defecto ahí.
 */
const almacen = Platform.OS === 'web' ? undefined : almacenSeguro;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const clave = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Si la app tiene con qué conectarse.
 *
 * No se lanza un error al importar el módulo: eso dejaría la pantalla en blanco
 * sin decir por qué. La web, sin las variables, dibuja el login igual y muestra
 * un aviso arriba explicando cuáles faltan — acá se hace lo mismo, y para eso el
 * cliente tiene que poder construirse aunque no sirva.
 */
export const estaConfigurado = Boolean(url && clave);

export const supabase = createClient(url ?? 'http://sin-configurar.invalid', clave ?? 'sin-configurar', {
  auth: {
    storage: almacen,
    autoRefreshToken: true,
    persistSession: true,
    // En un teléfono no hay URL que leer: el login con Google vuelve por un
    // enlace profundo que se maneja a mano.
    detectSessionInUrl: false,
    // supabase-js arranca en el flujo implícito, que vuelve con los tokens
    // pegados después de un `#`. El login espera un `?code=` para canjear, y
    // sin esto Google volvía a la app y decía que no traía el código. La web
    // ya usa PKCE porque @supabase/ssr lo trae por defecto.
    flowType: 'pkce',
  },
});

/**
 * El token se refresca solo mientras la app está adelante.
 *
 * Sin esto, volver a la app después de un rato la encuentra con el token
 * vencido: la primera consulta falla y parece que se cerró la sesión. En la web
 * no hace falta porque la pestaña nunca se "duerme" del todo.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', estado => {
    if (estado === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
