import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, UserSettings } from '@compartido/types';
import { Formatters, makeFormatters } from '@compartido/format';

type Config = Pick<UserSettings, 'currency' | 'locale' | 'timezone'>;

/**
 * La moneda, el locale y la zona horaria del usuario, igual que en la web.
 *
 * Arranca en los mismos valores por defecto que `components/SettingsContext.tsx`
 * y con el mismo `makeFormatters` compartido: por eso un monto se ve idéntico en
 * los dos lados sin que nadie tenga que acordarse de mantenerlo así.
 *
 * Todavía no trae la configuración guardada del usuario — eso depende de cómo
 * el teléfono hable con los datos, que es la decisión que falta. Hasta entonces
 * usa los valores por defecto, que es exactamente lo que hace la web cuando la
 * petición falla.
 */
const ContextoDeAjustes = createContext<{ settings: Config; fmt: Formatters }>({
  settings: DEFAULT_SETTINGS,
  fmt: makeFormatters(DEFAULT_SETTINGS),
});

export function useAjustes() {
  return useContext(ContextoDeAjustes);
}

/** Atajo para el caso más común: formatear plata y fechas. */
export function useFormatters(): Formatters {
  return useContext(ContextoDeAjustes).fmt;
}

export function ProveedorDeAjustes({
  settings = DEFAULT_SETTINGS, children,
}: {
  settings?: Config;
  children: React.ReactNode;
}) {
  return (
    <ContextoDeAjustes.Provider value={{ settings, fmt: makeFormatters(settings) }}>
      {children}
    </ContextoDeAjustes.Provider>
  );
}
