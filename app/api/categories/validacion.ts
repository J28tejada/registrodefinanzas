/**
 * Las reglas del ícono y el color viven en `lib/`, no acá.
 *
 * El teléfono crea y edita categorías escribiendo contra la base, sin pasar por
 * estas rutas: si la validación se quedaba adentro de `app/`, del otro lado
 * habría que escribirla de nuevo. Este archivo queda como puerta para las rutas
 * que ya la importaban.
 */
export { leerIconoYColor } from '@/lib/categorias-campos';
export type { IconoYColor } from '@/lib/categorias-campos';
