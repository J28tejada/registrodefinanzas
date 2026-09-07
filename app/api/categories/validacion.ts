import { ICONOS_CATEGORIA, COLORES_CATEGORIA } from '@/lib/iconos-categoria';

/**
 * Lee el ícono y el color del cuerpo, aceptando solo los del catálogo.
 *
 * Se valida contra el catálogo y no se guarda lo que venga: la clave se dibuja
 * con un `Record` en el cliente, así que una inventada terminaría en el ícono
 * genérico sin que nadie entienda por qué no quedó lo que eligió.
 *
 * `null` es una elección válida —"sacale el ícono"— y distinta de no mandar la
 * clave, que es "no lo toques".
 */
export type IconoYColor = { icon?: string | null; color?: string | null };

export function leerIconoYColor(
  b: Record<string, unknown>,
): { ok: true; campos: IconoYColor } | { ok: false; error: string } {
  const campos: IconoYColor = {};

  if (b.icon !== undefined) {
    if (b.icon === null || b.icon === '') {
      campos.icon = null;
    } else if (typeof b.icon !== 'string' || !(b.icon in ICONOS_CATEGORIA)) {
      return { ok: false, error: 'Ese ícono no existe.' };
    } else {
      campos.icon = b.icon;
    }
  }

  if (b.color !== undefined) {
    if (b.color === null || b.color === '') {
      campos.color = null;
    } else if (typeof b.color !== 'string' || !COLORES_CATEGORIA.includes(b.color as never)) {
      return { ok: false, error: 'Ese color no existe.' };
    } else {
      campos.color = b.color;
    }
  }

  return { ok: true, campos };
}
