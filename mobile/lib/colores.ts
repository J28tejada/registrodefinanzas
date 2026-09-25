import { useColorScheme } from 'react-native';
import tema from '@compartido/tema.json';

type Nombre = keyof typeof tema.claro;

/** `linea-fuerte` -> `lineaFuerte`, para escribir `c.lineaFuerte` y no `c['linea-fuerte']`. */
type Camello<S extends string> = S extends `${infer A}-${infer B}` ? `${A}${Capitalize<Camello<B>>}` : S;
export type Colores = { [K in Nombre as Camello<K>]: string };

const aCamello = (paleta: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(paleta).map(([k, v]) => [k.replace(/-(\w)/g, (_, l: string) => l.toUpperCase()), v]),
  ) as Colores;

const CLARO = aCamello(tema.claro);
const OSCURO = aCamello(tema.oscuro);

/**
 * Los colores del tema para lo que no acepta `className`.
 *
 * Los íconos de lucide, el `ActivityIndicator` y el `placeholderTextColor`
 * reciben un color suelto, y un hex escrito a mano no se entera de que el
 * teléfono pasó a modo claro. Esto devuelve el mismo color que `text-tinta-2` o
 * `bg-acento`, sacado del mismo `tema.json`, según lo que diga el sistema.
 */
export function useColores(): Colores {
  return useColorScheme() === 'dark' ? OSCURO : CLARO;
}
