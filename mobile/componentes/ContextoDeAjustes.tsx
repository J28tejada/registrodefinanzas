import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, UserSettings } from '@compartido/types';
import { Formatters, makeFormatters } from '@compartido/format';
import { getSettings, saveSettings } from '@compartido/db';
import { db } from '../lib/datos';
import { useSesion } from './ContextoDeSesion';

type Config = Pick<UserSettings, 'currency' | 'locale' | 'timezone'>;

interface Contexto {
  settings: Config;
  /** false hasta que llega la config real: evita pintar montos en otra moneda. */
  loaded: boolean;
  fmt: Formatters;
  save: (cambios: Partial<Config>) => Promise<void>;
}

/**
 * La moneda, el locale y la zona horaria del usuario. El gemelo de
 * components/SettingsContext.tsx.
 *
 * La web pide `/api/settings`, que no hace otra cosa que llamar a
 * `getSettings(db)`; el teléfono llama a ESA MISMA función. Mismo
 * `makeFormatters` compartido de los dos lados: por eso un monto se ve idéntico
 * sin que nadie tenga que acordarse de mantenerlo así.
 *
 * `loaded` importa más de lo que parece: mientras es false la app no sabe
 * todavía en qué moneda mostrar, y pintar "US$1,234" para después cambiarlo a
 * "RD$1,234" es peor que esperar un instante.
 */
const ContextoDeAjustes = createContext<Contexto>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  fmt: makeFormatters(DEFAULT_SETTINGS),
  save: async () => {},
});

export function useAjustes() {
  return useContext(ContextoDeAjustes);
}

/** Atajo para el caso más común: formatear plata y fechas. */
export function useFormatters(): Formatters {
  return useContext(ContextoDeAjustes).fmt;
}

export function ProveedorDeAjustes({
  settings: fijos, children,
}: {
  /**
   * La configuración por props es para la galería, que dibuja los componentes
   * con datos fijos y sin sesión. Con sesión gana lo que traiga de la base.
   */
  settings?: Config;
  children: React.ReactNode;
}) {
  const { session } = useSesion();
  const usuario = session?.user?.id;
  const [traidos, setTraidos] = useState<Config>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!usuario) { setLoaded(true); return; }
    try {
      const { currency, locale, timezone } = await getSettings(db(usuario));
      setTraidos({ currency, locale, timezone });
    } catch {
      // Sin red se sigue con los valores por defecto, igual que en la web.
    } finally {
      setLoaded(true);
    }
  }, [usuario]);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (cambios: Partial<Config>) => {
    if (!usuario) throw new Error('No hay sesión');
    const { currency, locale, timezone } = await saveSettings(db(usuario), cambios);
    setTraidos({ currency, locale, timezone });
  }, [usuario]);

  const settings = fijos ?? traidos;
  const fmt = useMemo(() => makeFormatters(settings), [settings]);

  return (
    <ContextoDeAjustes.Provider
      value={{ settings, loaded: Boolean(fijos) || loaded, fmt, save }}
    >
      {children}
    </ContextoDeAjustes.Provider>
  );
}
