'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, UserSettings } from '@/lib/types';
import { Formatters, makeFormatters } from '@/lib/format';

type Config = Pick<UserSettings, 'currency' | 'locale' | 'timezone'>;

interface SettingsContextType {
  settings: Config;
  /** false hasta que llega la config real: evita pintar montos en otra moneda. */
  loaded: boolean;
  fmt: Formatters;
  save: (cambios: Partial<Config>) => Promise<void>;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  fmt: makeFormatters(DEFAULT_SETTINGS),
  save: async () => {},
  refresh: async () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

/** Atajo para el caso más común: formatear plata y fechas. */
export function useFormatters(): Formatters {
  return useContext(SettingsContext).fmt;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Config>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data?.currency) {
          setSettings({ currency: data.currency, locale: data.locale, timezone: data.timezone });
        }
      }
    } catch {
      // sin red se sigue con los valores por defecto
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (cambios: Partial<Config>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar la configuración');
    setSettings({ currency: data.currency, locale: data.locale, timezone: data.timezone });
  }, []);

  const fmt = useMemo(() => makeFormatters(settings), [settings]);

  return (
    <SettingsContext.Provider value={{ settings, loaded, fmt, save, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}
