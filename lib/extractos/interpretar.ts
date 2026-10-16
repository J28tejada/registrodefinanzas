/**
 * De lo que leyó el formato (`LecturaCruda`, con datos personales) a lo que
 * viaja al cliente (`ExtractoLeido`, limpio).
 *
 * El orden importa:
 * 1. Cuadrar primero. Si no cuadra, no sale ninguna línea.
 * 2. Clasificar y emparejar cada devolución con su compra sobre el detalle
 *    CRUDO, porque el número de orden que las une es justo lo que la limpieza
 *    después enmascara.
 * 3. Limpiar, y recién ahí armar la salida, sin el nombre del titular.
 */
import { clavesDelEstado } from './claves';
import { clasificar, REGLAS_POPULAR, type Clasificacion } from './clasificar';
import { conciliar } from './conciliar';
import { formatoPorId } from './formatos';
import { claveDeComercio, sanear } from './sanear';
import type {
  CodigoDeLectura, ExtractoLeido, LecturaCruda, LineaCruda, LineaDeExtracto, MotivoNoCuadra,
} from './tipos';

export type Interpretacion =
  | { ok: true; extracto: ExtractoLeido }
  | { ok: false; codigo: CodigoDeLectura; motivo?: MotivoNoCuadra; fecha?: string };

/**
 * Los números de orden del comercio: en el primer pedazo, antes de la coma,
 * un grupo con 5 dígitos o más ('AMZN MKTP*12-34567-89012'). Lo de después de
 * la coma son referencias del banco, distintas en la compra y en la devolución.
 */
function idsDeOrden(l: LineaCruda): string[] {
  const base = (l.detalle[0] ?? '').split(',')[0];
  return (base.match(/[A-Z0-9]*\d[A-Z0-9-]{4,}/gi) ?? [])
    .filter(t => (t.match(/\d/g) ?? []).length >= 5);
}

/**
 * Cada devolución con su compra en este mismo estado, si la hay: índice de la
 * devolución → índice de la compra.
 *
 * Primero por número de orden; si no trae, por el comercio. La compra tiene
 * que ser de antes (o del mismo día) y de al menos el monto devuelto: la
 * compra se guarda por su neto y un neto negativo no existe. Entre varias,
 * gana la del mismo monto (devolución completa) y después la más cercana.
 */
function emparejarDevoluciones(lineas: LineaCruda[], clases: Clasificacion[]): Map<number, number> {
  const pares = new Map<number, number>();
  const usadas = new Set<number>();
  lineas.forEach((d, i) => {
    if (clases[i].clase !== 'refund') return;
    const candidatas = lineas
      .map((c, j) => ({ c, j }))
      .filter(({ c, j }) => clases[j].clase === 'purchase' && !usadas.has(j) &&
        -c.centavos >= d.centavos && c.fecha <= d.fecha);

    const ids = idsDeOrden(d);
    const porOrden = ids.length
      ? candidatas.filter(({ c }) => idsDeOrden(c).some(x => ids.includes(x)))
      : [];
    const tienda = claveDeComercio(d.detalle[0] ?? '');
    const porTienda = tienda
      ? candidatas.filter(({ c }) => claveDeComercio(c.detalle[0] ?? '') === tienda)
      : [];
    const elegibles = porOrden.length ? porOrden : porTienda;
    if (!elegibles.length) return;

    elegibles.sort((a, b) =>
      Number(-b.c.centavos === d.centavos) - Number(-a.c.centavos === d.centavos) || b.j - a.j);
    usadas.add(elegibles[0].j);
    pares.set(i, elegibles[0].j);
  });
  return pares;
}

export function interpretar(c: LecturaCruda): Interpretacion {
  const cuadre = conciliar(c);
  if (!cuadre.ok) {
    return { ok: false, codigo: 'NO_CUADRA', motivo: cuadre.motivo, ...(cuadre.fecha ? { fecha: cuadre.fecha } : {}) };
  }

  const reglas = formatoPorId(c.formato)?.reglas ?? REGLAS_POPULAR;
  const claves = clavesDelEstado(c.lineas);
  const clases = c.lineas.map(l => clasificar(l.detalle, l.centavos, c.titular, reglas));
  const devoluciones = emparejarDevoluciones(c.lineas, clases);

  const lineas: LineaDeExtracto[] = c.lineas.map((l, i) => {
    const limpio = sanear(l.detalle, clases[i], l.centavos, c.titular);
    const compra = devoluciones.get(i);
    return {
      clave: claves[i],
      asentada: l.asentada,
      fecha: l.fecha,
      centavos: l.centavos,
      saldoCentavos: l.saldoCentavos,
      clase: clases[i].clase,
      comercio: limpio.comercio,
      descripcion: limpio.descripcion,
      matchKey: limpio.matchKey,
      ultimos4Contraparte: limpio.ultimos4Contraparte,
      devolucionDe: compra === undefined ? null : claves[compra],
    };
  });

  const creditos = lineas.filter(l => l.centavos > 0).length;
  return {
    ok: true,
    // Campo por campo y no con `...c`: así el titular y el detalle crudo no
    // pueden colarse aunque mañana `LecturaCruda` sume algo.
    extracto: {
      formato: c.formato,
      banco: c.banco,
      producto: c.producto,
      tipoDeCuenta: c.tipoDeCuenta,
      moneda: c.moneda,
      ultimos4: c.ultimos4,
      desde: lineas[0]?.asentada ?? c.corte,
      hasta: lineas[lineas.length - 1]?.asentada ?? c.corte,
      saldoInicialCentavos: c.saldoInicialCentavos,
      saldoFinalCentavos: c.saldoFinalCentavos,
      conciliacion: { lineas: lineas.length, creditos, debitos: lineas.length - creditos },
      lineas,
    },
  };
}
