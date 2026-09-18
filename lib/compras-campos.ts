/**
 * Las reglas de un artículo del súper, escritas una vez.
 *
 * Son las mismas cinco para los cuatro lugares que lo escriben: alta y edición
 * de un artículo de LISTA, alta y edición de uno de COMPRA. Estaban copiadas en
 * las cuatro rutas de `app/api`, y el teléfono habría sumado otras cuatro. Con
 * ocho copias, "el precio no puede ser negativo" deja de ser una regla y pasa a
 * ser una costumbre que algunos archivos tienen.
 *
 * La única diferencia entre los dos: el artículo de una compra se puede tildar
 * —está en el carrito— y el de una lista no, porque una plantilla no se tilda.
 */
export interface ArticuloNuevo {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

export type CambiosDeArticulo = Partial<ArticuloNuevo & { checked: boolean }>;

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string };

/** Cantidad o precio: el mismo par de reglas, con el nombre del campo. */
function numero(
  valor: unknown, campo: 'quantity' | 'unit_price',
): { ok: true; n: number } | { ok: false; error: string } {
  const n = Number(valor);
  if (campo === 'quantity') {
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: 'La cantidad tiene que ser mayor que cero.' };
    }
  } else if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: 'El precio no puede ser negativo.' };
  }
  return { ok: true, n };
}

export function leerArticuloNuevo(b: Record<string, unknown>): Resultado<ArticuloNuevo> {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'Ponele un nombre al artículo.' };

  // La cantidad por defecto es 1 y el precio 0: en el súper mucha gente arma la
  // lista primero y recién en la góndola pone el precio.
  const cantidad = numero(b.quantity === undefined || b.quantity === '' ? 1 : b.quantity, 'quantity');
  if (!cantidad.ok) return cantidad;
  const precio = numero(b.unit_price === undefined || b.unit_price === '' ? 0 : b.unit_price, 'unit_price');
  if (!precio.ok) return precio;

  return {
    ok: true,
    datos: {
      name,
      category: typeof b.category === 'string' && b.category.trim() ? b.category.trim() : 'Otros',
      quantity: cantidad.n,
      unit: typeof b.unit === 'string' && b.unit.trim() ? b.unit.trim() : 'unidad',
      unit_price: precio.n,
    },
  };
}

/**
 * Los cambios de un artículo que ya existe.
 *
 * No mandar una clave es "no la toques", así que solo entra lo que viene. Con
 * `conTilde` se acepta además `checked`, que es lo propio de una compra.
 */
export function leerCambiosDeArticulo(
  b: Record<string, unknown>,
  opciones?: { conTilde?: boolean },
): Resultado<CambiosDeArticulo> {
  const cambios: CambiosDeArticulo = {};

  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return { ok: false, error: 'El nombre no puede quedar vacío.' };
    cambios.name = name;
  }
  if (b.category !== undefined) cambios.category = String(b.category).trim() || 'Otros';
  if (b.unit !== undefined) cambios.unit = String(b.unit).trim() || 'unidad';
  if (opciones?.conTilde && b.checked !== undefined) cambios.checked = Boolean(b.checked);

  if (b.quantity !== undefined) {
    const r = numero(b.quantity, 'quantity');
    if (!r.ok) return r;
    cambios.quantity = r.n;
  }
  if (b.unit_price !== undefined) {
    const r = numero(b.unit_price, 'unit_price');
    if (!r.ok) return r;
    cambios.unit_price = r.n;
  }

  if (Object.keys(cambios).length === 0) {
    return { ok: false, error: 'No hay nada que cambiar.' };
  }
  return { ok: true, datos: cambios };
}
