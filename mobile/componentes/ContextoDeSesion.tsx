import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Contexto {
  session: Session | null;
  /** false hasta saber si hay sesión guardada. Evita parpadear al login. */
  listo: boolean;
}

const ContextoDeSesion = createContext<Contexto>({ session: null, listo: false });

export function useSesion() {
  return useContext(ContextoDeSesion);
}

/**
 * La sesión del usuario, leída del Keychain al arrancar.
 *
 * Reemplaza a `middleware.ts` de la web, que hacía el mismo trabajo del lado del
 * servidor: decidir si esta persona puede ver la app o le toca el login.
 *
 * `listo` importa más de lo que parece: leer el Keychain tarda unos
 * milisegundos, y sin esperar a que termine la app manda al login a alguien que
 * SÍ tenía sesión — se ve como un parpadeo al abrir, cada vez.
 */
export function ProveedorDeSesion({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setListo(true);
    });

    // Cubre entrar, salir y el refresco del token, que puede pasar en cualquier
    // momento mientras la app está abierta.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <ContextoDeSesion.Provider value={{ session, listo }}>{children}</ContextoDeSesion.Provider>
  );
}
