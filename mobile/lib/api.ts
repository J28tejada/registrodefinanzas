import { fetch as fetchConStream } from 'expo/fetch';
import { supabase } from './supabase';

/**
 * Lo poco que el teléfono NO resuelve contra la base.
 *
 * Todo lo demás —movimientos, tarjetas, presupuestos, categorías— va derecho a
 * Supabase con `lib/db.ts`, y RLS es lo que separa los datos de una persona de
 * los de otra. Acá viven las excepciones, que son dos clases de cosas: las que
 * necesitan un secreto que no puede estar adentro de la app —la clave del
 * modelo del asistente, las de Gmail, Telegram y WhatsApp— y las que el
 * teléfono no puede correr:
 * leer el PDF de un estado de cuenta, que es pdf.js. De ese último solo pasa
 * por acá la lectura; cotejarlo con lo anotado, importarlo y deshacerlo vuelve
 * a ir directo.
 *
 * La sesión viaja en `Authorization` y no en una cookie, porque la app no tiene
 * cookies: guarda su sesión en el llavero del teléfono. Es el mismo token que
 * el navegador lleva en la cookie, y del otro lado lo valida el mismo Supabase
 * —ver `tokenDeCabecera` en lib/supabase/server.ts—.
 *
 * `expo/fetch` y no el `fetch` de React Native: el asistente contesta en
 * chorro, y el fetch de React Native no expone `response.body`. Con el de React
 * Native la respuesta llegaría entera de golpe al final, que es justo lo que la
 * pantalla no quiere.
 */
export const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const hayApi = BASE.length > 0;

export const FALTA_LA_API =
  'Falta decir dónde vive la app web. Poné EXPO_PUBLIC_API_URL en mobile/.env '
  + 'con la dirección de tu despliegue.';

/** Lo que tira `llamarApi` sin sesión, antes de salir: quien llama lo puede distinguir de un corte de red. */
export const SIN_SESION = 'Tenés que iniciar sesión.';

/** Llama a una ruta de la web con la sesión de este teléfono. */
export async function llamarApi(
  ruta: string, opciones: { method?: string; body?: unknown } = {},
): Promise<Response> {
  if (!hayApi) throw new Error(FALTA_LA_API);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error(SIN_SESION);

  return fetchConStream(`${BASE}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opciones.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
  }) as unknown as Promise<Response>;
}
