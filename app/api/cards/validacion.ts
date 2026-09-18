/**
 * Las reglas del ciclo viven en `lib/`, no acá.
 *
 * El teléfono escribe contra la misma base sin pasar por estas rutas, así que
 * si la validación se quedaba adentro de `app/` había que escribirla de nuevo
 * del otro lado — y dos copias de seis reglas terminan siempre con una
 * corregida y la otra no. Este archivo queda como puerta para las rutas que ya
 * la importaban.
 */
export { leerCamposDeCiclo } from '@/lib/tarjetas-campos';
export type { CamposDeCiclo } from '@/lib/tarjetas-campos';
