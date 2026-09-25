import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle, CheckCircle2, Clock, Coins, Globe, Loader2, LogOut,
} from 'lucide-react-native';
import Texto from '../componentes/Texto';
import Pantalla from '../componentes/Pantalla';
import Selector from '../componentes/Selector';
import PanelDeCategorias from '../componentes/PanelDeCategorias';
import { useAjustes } from '../componentes/ContextoDeAjustes';
import { useSesion } from '../componentes/ContextoDeSesion';
import { supabase } from '../lib/supabase';
import { CURRENCIES } from '@compartido/types';
import { makeFormatters, zonasHorarias } from '@compartido/format';
import { useColores } from '../lib/colores';

/** El gemelo de app/settings/page.tsx. */
export default function Configuracion() {
  const paleta = useColores();
  const router = useRouter();
  const { settings, loaded, save } = useAjustes();
  const { session } = useSesion();

  const [currency, setCurrency] = useState(settings.currency);
  const [locale, setLocale] = useState(settings.locale);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');

  const email = session?.user?.email ?? '';

  useEffect(() => {
    setCurrency(settings.currency);
    setLocale(settings.locale);
    setTimezone(settings.timezone);
  }, [settings]);

  const zonas = useMemo(() => zonasHorarias(), []);
  const vistaPrevia = useMemo(
    () => makeFormatters({ currency, locale, timezone }),
    [currency, locale, timezone],
  );

  const hayCambios =
    currency !== settings.currency || locale !== settings.locale || timezone !== settings.timezone;

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setGuardado(false);
    try {
      await save({ currency, locale, timezone });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const salir = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  /** Al elegir moneda de la lista, el locale que le pega viene de regalo. */
  const elegirMoneda = (codigo: string) => {
    if (codigo === 'otra') return;
    setCurrency(codigo);
    const opcion = CURRENCIES.find(c => c.code === codigo);
    if (opcion) setLocale(opcion.locale);
  };

  if (!loaded) {
    return (
      <View className="flex-1 items-center justify-center">
        <Loader2 size={24} color={paleta.tinta2} />
      </View>
    );
  }

  return (
    <Pantalla className="gap-6" keyboardShouldPersistTaps="handled">
      <View>
        <Texto className="text-xl font-semibold text-tinta">Configuración</Texto>
        <Texto className="text-tinta-2 text-sm">Moneda, formato y zona horaria de tu cuenta</Texto>
      </View>

      {error ? (
        <View className="flex-row items-start gap-2 bg-peligro/10 border border-peligro/20 rounded-xl px-4 py-3">
          <View className="mt-0.5"><AlertCircle size={16} color={paleta.peligro} /></View>
          <Texto className="text-peligro text-sm flex-1">{error}</Texto>
        </View>
      ) : null}
      {guardado && !hayCambios ? (
        <View className="flex-row items-center gap-2 bg-acento/10 border border-acento/20 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} color={paleta.acento} />
          <Texto className="text-acento text-sm flex-1">
            Configuración guardada. Los montos ya se muestran en {settings.currency}.
          </Texto>
        </View>
      ) : null}

      <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 gap-5">
        {/* Moneda */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Coins size={16} color={paleta.acento} />
            <Texto className="text-sm text-tinta">Moneda</Texto>
          </View>
          <Selector
            value={CURRENCIES.some(c => c.code === currency) ? currency : 'otra'}
            opciones={[
              ...CURRENCIES.map(c => ({ valor: c.code, etiqueta: `${c.code} — ${c.name}` })),
              { valor: 'otra', etiqueta: 'Otra (escribir el código)' },
            ]}
            onChange={elegirMoneda}
            titulo="Moneda"
          />
          {/* El `font-mono` de la web no se porta: el teléfono solo carga Inter,
              y pedir monospace acá deja que cada aparato elija la suya. */}
          <TextInput
            value={currency}
            onChangeText={t => setCurrency(t.toUpperCase().slice(0, 3))}
            placeholder="Código ISO, ej. DOP"
            placeholderTextColor={paleta.tinta2}
            autoCapitalize="characters"
            autoCorrect={false}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2 text-sm text-tinta"
          />
          <Texto className="text-xs text-tinta-2">
            Cambia cómo se muestran los montos. No convierte lo ya registrado: los
            números guardados quedan igual, solo cambia el símbolo.
          </Texto>
        </View>

        {/* Locale */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Globe size={16} color={paleta.info} />
            <Texto className="text-sm text-tinta">Formato regional</Texto>
          </View>
          <TextInput
            value={locale}
            onChangeText={setLocale}
            placeholder="es-DO"
            placeholderTextColor={paleta.tinta2}
            autoCapitalize="none"
            autoCorrect={false}
            className="w-full bg-hundido border border-linea-fuerte rounded-lg px-3 py-2.5 text-sm text-tinta"
          />
          <Texto className="text-xs text-tinta-2">
            Define separadores de miles y cómo se escriben las fechas. Se completa
            solo al elegir una moneda de la lista.
          </Texto>
        </View>

        {/* Zona horaria */}
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <Clock size={16} color={paleta.info} />
            <Texto className="text-sm text-tinta">Zona horaria</Texto>
          </View>
          <Selector
            value={timezone}
            opciones={[
              ...(zonas.includes(timezone) ? [] : [{ valor: timezone, etiqueta: timezone }]),
              ...zonas.map(z => ({ valor: z, etiqueta: z })),
            ]}
            onChange={setTimezone}
            titulo="Zona horaria"
          />
          <Texto className="text-xs text-tinta-2">
            Con esto se resuelve qué día es «hoy». El servidor corre en UTC: sin la zona
            correcta, un gasto de las nueve de la noche quedaría anotado mañana.
          </Texto>
        </View>

        {/* Vista previa */}
        <View className="bg-hundido rounded-xl p-4 gap-1.5">
          <Texto className="text-xs text-tinta-2">Así se va a ver</Texto>
          <Texto className="text-lg font-semibold text-tinta">{vistaPrevia.money(1234567.89)}</Texto>
          <Texto className="text-xs text-tinta-2">
            {vistaPrevia.date(vistaPrevia.today())} · hoy es {vistaPrevia.today()}
          </Texto>
        </View>

        <Pressable
          onPress={guardar}
          disabled={guardando || !hayCambios}
          style={guardando || !hayCambios ? { opacity: 0.5 } : undefined}
          className="w-full py-3 bg-primario active:bg-primario/85 rounded-lg flex-row items-center justify-center gap-2"
        >
          {guardando ? <Loader2 size={16} color={paleta.sobrePrimario} /> : <CheckCircle2 size={16} color={paleta.sobrePrimario} />}
          <Texto className="text-sobre-primario text-sm font-medium">
            {hayCambios ? 'Guardar cambios' : 'Sin cambios'}
          </Texto>
        </Pressable>
      </View>

      <PanelDeCategorias />

      {/* Cuenta */}
      <View className="bg-panel border border-t-borde-luz border-linea rounded-2xl p-4 flex-row items-center gap-3">
        <View className="flex-1">
          <Texto className="text-sm text-tinta font-medium" numberOfLines={1}>
            {email || 'Sesión iniciada'}
          </Texto>
          <Texto className="text-xs text-tinta-2">Tus datos son solo tuyos: nadie más los ve.</Texto>
        </View>
        <Pressable
          onPress={salir}
          className="px-3 py-2 bg-hundido active:bg-peligro/85 rounded-lg flex-row items-center gap-1.5"
        >
          <LogOut size={14} color={paleta.tinta} />
          <Texto className="text-tinta text-xs font-medium">Salir</Texto>
        </Pressable>
      </View>
    </Pantalla>
  );
}
