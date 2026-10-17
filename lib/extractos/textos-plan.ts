/**
 * Los textos de la revisión de un estado de cuenta: secciones, motivos,
 * preguntas, botones y avisos.
 *
 * Viven acá y no en cada pantalla por lo mismo que `textos.ts`: la web y el
 * teléfono tienen que decir exactamente lo mismo, y la única forma de que no se
 * separen es que lo escriba un solo lugar. `planear.ts` arma la vista con estas
 * funciones; las pantallas solo dibujan.
 *
 * Impersonal y con el verbo de la app, 'anotar'. La plata NO se formatea acá:
 * cada app tiene su formateador (moneda, separadores, locale de la persona). Los
 * textos que llevan un monto lo reciben ya formateado, como texto.
 */
import type { TransactionSource } from '../types';

// ─── Fechas ──────────────────────────────────────────────────────────────────
//
// Con una tabla y no con Intl, como todo `lib/extractos`: el mes abreviado
// depende de la versión de los datos de locale de cada motor ('sept' en unos,
// 'sep' en otros), y la web y el teléfono tienen que decir lo mismo.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-09-03' → '3 sep'; con `conAnio`, '3 sep 2026'. Acepta un timestamp: usa su día. */
export function fechaCorta(iso: string, conAnio = false): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = `${d} ${MESES[m - 1] ?? '?'}`;
  return conAnio ? `${base} ${y}` : base;
}

/** La fecha de una fila: sin año si es del año de hoy, que es lo normal. */
export function fechaDeFila(iso: string, hoy: string): string {
  return fechaCorta(iso, iso.slice(0, 4) !== hoy.slice(0, 4));
}

/**
 * El período del estado: '24 ago – 22 sep 2026'. El año va una sola vez si los
 * dos extremos son del mismo; si cruza diciembre, va en los dos.
 */
export function periodo(desde: string, hasta: string): string {
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  return `${fechaCorta(desde, !mismoAnio)} – ${fechaCorta(hasta, true)}`;
}

function plural(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}

// ─── El encabezado ───────────────────────────────────────────────────────────

/** El nombre con el que se muestra cada banco que se sabe leer. */
export const NOMBRE_DEL_BANCO: Record<string, string> = {
  popular: 'Banco Popular',
};

export function nombreDelBanco(banco: string): string {
  return NOMBRE_DEL_BANCO[banco] ?? banco;
}

/** 'Cuenta Digital Libre ··3456', sin repetir los 4 si el nombre ya los trae. */
export function nombreConUltimos4(nombre: string, ultimos4: string): string {
  if (!ultimos4 || nombre.endsWith(`··${ultimos4}`)) return nombre;
  return `${nombre} ··${ultimos4}`;
}

export const ARCHIVADA = '(archivada)';

export function subtituloDelResumen(banco: string, desde: string, hasta: string): string {
  return `${nombreDelBanco(banco)} · ${periodo(desde, hasta)}`;
}

export function insigniaCuadra(lineas: number): string {
  return `Cuadra con el banco · ${lineas} ${plural(lineas, 'movimiento', 'movimientos')}`;
}

/** Recibe los dos saldos ya formateados por la app. */
export function textoDeSaldos(anterior: string, alCorte: string): string {
  return `Saldo anterior ${anterior} → al corte ${alCorte}`;
}

export const ANOTAR_EN = 'Anotar en';

// ─── Las secciones, en el orden fijo en que se muestran ──────────────────────

export const TITULOS_DE_SECCION = {
  revisar: 'Para revisar',
  'se-anotan': 'Se anotan',
  pagos: 'Pagos de tarjeta',
  'ya-estaban': 'Ya estaban anotados',
  'no-se-anotan': 'No se anotan',
  'ya-importados': 'Ya importados antes',
} as const;

/** 'Se anotan · 12': el título de la tarjeta con cuántas filas tiene. */
export function tituloConCuenta(titulo: string, n: number): string {
  return `${titulo} · ${n}`;
}

export function decididos(k: number, n: number): string {
  return `${k} de ${n} ${plural(n, 'decidido', 'decididos')}`;
}

export function notaYaImportados(n: number): string {
  return n === 1
    ? '1 movimiento de este estado ya se importó.'
    : `${n} movimientos de este estado ya se importaron.`;
}

// ─── Los conteos del resumen ─────────────────────────────────────────────────

export function conteoSeAnotan(gastos: number, ingresos: number): string {
  const n = gastos + ingresos;
  if (ingresos === 0) return `Se ${plural(n, 'anota', 'anotan')} ${n} ${plural(n, 'gasto', 'gastos')}`;
  if (gastos === 0) return `Se ${plural(n, 'anota', 'anotan')} ${n} ${plural(n, 'ingreso', 'ingresos')}`;
  return `Se anotan ${n}: ${gastos} en gastos y ${ingresos} en ingresos`;
}

export function conteoPagos(n: number): string {
  return `Pagos de tarjeta: ${n}`;
}

export function conteoYaEstaban(n: number): string {
  return `Ya estaban anotados: ${n}`;
}

export function conteoNoSeAnotan(n: number): string {
  return `No se anotan: ${n}`;
}

export function conteoYaImportados(n: number): string {
  return `Ya importados antes: ${n}`;
}

export function avisoParaRevisar(n: number): string {
  return `Para revisar: ${n}. Si no ${plural(n, 'lo decidís, no se anota', 'los decidís, no se anotan')}.`;
}

// ─── El botón y el pie ───────────────────────────────────────────────────────

export function botonImportar(n: number): string {
  return `Importar ${n} ${plural(n, 'movimiento', 'movimientos')}`;
}

export const NADA_NUEVO = 'No hay nada nuevo para importar';

/** Todavía nada para importar, pero con líneas sin decidir: eso es lo que falta. */
export const FALTA_DECIDIR = 'Falta decidir lo que está en «Para revisar».';

/** Recibe la fecha ya legible ('3 sep'). */
export function yaSeImporto(fecha: string): string {
  return `Este estado de cuenta ya se importó el ${fecha}.`;
}

/**
 * El pie, con los totales ya formateados. Dice la verdad sobre lo que queda sin
 * decidir: no va a ningún lado "para después"; se decide subiendo el mismo PDF
 * otra vez, que es seguro porque lo ya importado no se repite.
 */
export function textoDelPie(gastos: string, ingresos: string, sinDecidir: number): string {
  const suma = `Se suman ${gastos} en gastos y ${ingresos} en ingresos.`;
  if (sinDecidir === 0) return suma;
  const quedan = sinDecidir === 1
    ? '1 queda sin decidir y no se anota'
    : `${sinDecidir} quedan sin decidir y no se anotan`;
  return `${suma} ${quedan}: para decidirlos después, volvé a subir este PDF; lo ya importado no se repite.`;
}

// ─── Los avisos del resumen ──────────────────────────────────────────────────

export function avisoCuentaNueva(nombre: string, ultimos4: string): string {
  return `No tenés esta cuenta en la Billetera: se crea «${nombreConUltimos4(nombre, ultimos4)}» al importar.`;
}

export const ELEGIR_OTRA = 'Elegir otra';

export function avisoCuentaAjena(ultimos4: string, nombre: string): string {
  return `Este estado de cuenta es de la cuenta ··${ultimos4}, no de «${nombre}».`;
}

export const USAR_LA_QUE_CORRESPONDE = 'Usar la que corresponde';

export function avisoCompletarUltimos4(nombre: string, ultimos4: string): string {
  return `«${nombre}» no tiene los últimos 4 de la cuenta: se le guarda ··${ultimos4} al importar.`;
}

export function avisoVariasCuentas(ultimos4: string): string {
  return `Hay más de una cuenta ··${ultimos4} en la Billetera: ¿cuál es?`;
}

/** Sin el nombre del libro, se dice igual sin nombrarlo. */
export function avisoSinCategoriaDeCargos(libro: string | null): string {
  const donde = libro ? `En «${libro}»` : 'En esta cuenta';
  return `${donde} no hay una categoría para lo que cobra el banco.`;
}

export function interruptorCrearCategoria(nombre: string): string {
  return `Crear «${nombre}»`;
}

/** Los símbolos que se le muestran a la persona; un código raro va tal cual. */
const SIMBOLOS: Record<string, string> = { DOP: 'RD$', USD: 'US$', EUR: '€' };

export function avisoOtraMoneda(delEstado: string, deLaApp: string): string {
  const s = (c: string) => SIMBOLOS[c] ?? c;
  return `Este estado de cuenta está en ${s(delEstado)} y la app lleva tus cuentas en ${s(deLaApp)}. ` +
    'Por ahora no se puede importar.';
}

// ─── Por qué una línea no se anota (los subtítulos de "No se anotan") ────────

export const NO_SE_ANOTA = {
  retiro: 'Retiro de efectivo: lo que gastes en efectivo se anota cuando lo gastás.',
  'entre-cuentas': 'Entre tus cuentas: la plata no entra ni sale, cambia de lugar.',
  devuelta: 'Se compró y se devolvió.',
  'sigue-a-su-compra': 'Va con su compra, que no se anota.',
  descontada: 'Se descuenta de su compra, que se anota por lo que quedó.',
  elegida: 'Elegiste no anotarla.',
  'sin-anotar-antes': 'La dejaste sin anotar la vez pasada.',
  aprendida: 'Las otras veces que apareció quedó sin anotar.',
} as const;

export const INTERRUPTOR_RETIROS = 'Anotar los retiros como gasto';

/** El subtítulo de los retiros con el interruptor prendido: ya no están acá, se fueron a "Se anotan". */
export const RETIROS_COMO_GASTO = 'Los retiros de efectivo se anotan como gasto.';

// ─── Lo que pregunta una línea para revisar ──────────────────────────────────

export const BORRADA = 'Lo borraste después de importarlo. ¿Lo anotamos de nuevo?';
export const DEPOSITO = '¿Es un ingreso o plata tuya que depositaste?';
export const DEVOLUCION_SIN_COMPRA = 'Devolución sin su compra en este estado de cuenta: ¿es un ingreso?';
export const ELEGI_UNA_CATEGORIA = 'Elegí una categoría.';
export const SIN_RECONOCER = 'No se reconoció qué es.';
export const ELEGI_LA_TARJETA = 'Elegí qué tarjeta se pagó.';
export const YA_LO_ANOTASTE = '¿Ya lo anotaste?';

export function transferenciaRecibida(ultimos4: string | null): string {
  return ultimos4 ? `Transferencia de ··${ultimos4}: ¿qué fue?` : 'Te transfirieron: ¿qué fue?';
}

export function transferenciaEnviada(ultimos4: string | null): string {
  return ultimos4 ? `Transferencia a ··${ultimos4}: ¿qué fue?` : 'Transferiste: ¿qué fue?';
}

/** Un movimiento que anotó otra persona de la cuenta compartida. Recibe la fecha legible. */
export function loAnotoOtro(autor: string | null, fecha: string): string {
  return autor ? `¿Es el que anotó ${autor} el ${fecha}?` : `¿Es el que se anotó el ${fecha}?`;
}

export function categoriaInexistente(categoria: string, libro: string | null): string {
  return `«${categoria}» no existe en ${libro ? `«${libro}»` : 'esta cuenta'}.`;
}

// ─── Los grupos de "Para revisar" ────────────────────────────────────────────

export const GRUPOS_DE_REVISION = {
  depositos: { titulo: 'Depósitos', pregunta: '¿Son ingresos o plata tuya que depositaste?' },
  'te-transfirieron': { titulo: 'Te transfirieron', pregunta: '¿Te pagaron algo o es plata tuya que volvió?' },
  transferiste: { titulo: 'Transferiste', pregunta: '¿Fueron gastos?' },
  'ya-anotado': { titulo: '¿Ya lo anotaste?', pregunta: null },
  devoluciones: { titulo: 'Devoluciones', pregunta: null },
  otros: { titulo: 'Sin reconocer', pregunta: null },
  'sin-categoria': { titulo: 'Sin categoría', pregunta: null },
  borrados: { titulo: 'Borrados después de importar', pregunta: null },
} as const;

/** Los botones que deciden un grupo entero: solo tocan lo que sigue sin decidir. */
export const BOTONES_DE_GRUPO = {
  sonIngresos: 'Son ingresos',
  sonPlataMia: 'Son plata mía',
  sonGastos: 'Son gastos',
  noAnotar: 'No anotar',
  anotarDeNuevo: 'Anotar de nuevo',
} as const;

// ─── Las opciones de una línea (las píldoras y la hoja) ──────────────────────

export const OPCIONES = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  yaEstaAnotado: 'Ya está anotado',
  pagoDeTarjeta: 'Pago de tarjeta',
  descontar: 'Descontar de la compra',
  noAnotar: 'No anotar',
  esElMismo: 'Es el mismo',
  esOtro: 'Es otro',
  anotarDeNuevo: 'Anotar de nuevo',
  esIngreso: 'Es ingreso',
  esPlataMia: 'Es plata mía',
  elegirCategoria: 'Elegí una categoría',
} as const;

// ─── Las filas que sí hacen algo ─────────────────────────────────────────────

export function pagoDeTarjeta(tarjeta: string): string {
  return `Pago a ${tarjeta}: baja lo que debés, no es un gasto.`;
}

/** Cómo llegó a la app lo que ya estaba anotado. */
export const ORIGEN: Record<TransactionSource, string> = {
  manual: 'a mano',
  voice: 'por voz',
  ai: 'del correo',
  whatsapp: 'vía WhatsApp',
  telegram: 'vía Telegram',
  statement: 'del banco',
};

/** "Ya estaba anotado: «Uber» · 3 sep · vía WhatsApp". La fecha llega legible. */
export function yaEstabaAnotado(descripcion: string, fecha: string, origen: TransactionSource | null): string {
  const via = origen ? ` · ${ORIGEN[origen]}` : '';
  return `Ya estaba anotado: «${descripcion}» · ${fecha}${via}`;
}

export function yaEstabaElPago(tarjeta: string, fecha: string): string {
  return `Ya estaba anotado: pago a ${tarjeta} · ${fecha}`;
}

export const YA_IMPORTADO = 'Ya importado.';

// ─── La categoría: el chip y por qué se sugirió ──────────────────────────────

export const NOTAS_DE_CATEGORIA = {
  nueva: 'nueva',
  neto: 'neto de devolución',
  revisa: 'revisá',
} as const;

/** 'Transporte › Combustible', como en la lista de movimientos. */
export function textoDeCategoria(categoria: string, subcategoria: string | null): string {
  return subcategoria ? `${categoria} › ${subcategoria}` : categoria;
}

export const PORQUE = {
  historial: 'Sugerida porque la última vez la pusiste ahí.',
  comercio: 'Sugerida por el nombre del comercio.',
  cargo: 'Sugerida porque es un cargo del banco.',
  interes: 'Sugerida porque son intereses de la cuenta.',
  nueva: 'Se crea al importar.',
} as const;

export function porqueRespaldo(generica: string): string {
  return `No se reconoció: va en ${generica}.`;
}

// ─── La hoja de una línea ────────────────────────────────────────────────────

export const HOJA = {
  titulo: '¿Qué hacemos con este movimiento?',
  categoria: 'Categoría',
  subcategoria: 'Subcategoría',
  /** La primera opción de la subcategoría: elegirla es siempre opcional. */
  sinSubcategoria: 'Sin subcategoría',
  descripcion: 'Descripción',
  listo: 'Listo',
  cerrar: 'Cerrar',
  bloqueada: 'Ya se importó: para cambiarlo, editá el movimiento o deshacé la importación.',
} as const;

/** "Banco: 1 sep · Compra: 31 ago". Recibe las fechas legibles. */
export function fechasDeLaHoja(asentada: string, fecha: string): string {
  return `Banco: ${asentada} · Compra: ${fecha}`;
}

export function extenderCategoria(n: number, comercio: string): string {
  return `Usar esta categoría en ${n === 1 ? 'la otra' : `las otras ${n}`} de ${comercio}`;
}

// ─── El resto de la pantalla ─────────────────────────────────────────────────
//
// No son del plan, pero las dos pantallas gemelas los dicen igual, y este es el
// único lugar que comparten. Los errores de lectura están en `textos.ts`.

/** Dónde se entra: la Billetera y el detalle de una cuenta de banco. */
export const ENTRADAS = {
  boton: 'Importar estado',
  botonCompleto: 'Importar estado de cuenta',
  tarjetaTitulo: 'Estado de cuenta',
  tarjetaTexto: 'Subí el PDF del banco y se anota lo que falte, sin repetir lo que ya está.',
} as const;

export const PANTALLA = {
  /** El enlace de arriba, que vuelve a donde se entra. */
  volver: 'Billetera',
  titulo: 'Importar estado de cuenta',
  subtitulo: 'Del PDF del banco a tus movimientos',
  explicacion:
    'Elegí el PDF tal como lo bajaste del banco. Se lee en el momento, se cuadra con los saldos del banco ' +
    'y no se guarda nada hasta que toques Importar.',
  alcance: 'Por ahora: cuentas de ahorro y corrientes del Banco Popular, en pesos.',
  elegirPdf: 'Elegir PDF',
  elegirOtroPdf: 'Elegir otro PDF',
  claveExplicacion: 'Es la que pide el banco para abrirlo. Se usa para leerlo y no se guarda.',
  claveCampo: 'Contraseña del PDF',
  abrir: 'Abrir',
  leyendo: 'Leyendo el estado de cuenta…',
  // Leído el PDF, falta lo que está en la base: sin eso no hay con qué cotejar.
  sinContexto: 'No se pudo comparar con lo que ya tenés anotado. Probá de nuevo.',
  sinCategorias: 'No se pudieron cargar las categorías de esa cuenta. Probá de nuevo.',
  sinLibro: 'No tenés ninguna cuenta donde anotar. Creá una y volvé a subir el PDF.',
  importando: 'Importando…',
  verLaCuenta: 'Ver la cuenta',
  importarOtro: 'Importar otro',
  deshacer: 'Deshacer',
  // Se pregunta antes: borra de una todo lo que la importación anotó.
  confirmarDeshacer: '¿Deshacer esta importación? Se borra lo que se anotó con ella.',
  // El otro botón de esa pregunta. Solo lo escribe el teléfono: el `confirm`
  // del navegador trae los suyos, y el `Alert` hay que dárselos.
  cancelar: 'Cancelar',
  deshecho: 'Deshecho: no quedó nada de esta importación.',
} as const;

/** Lo que quedó después de importar, con los números de la función SQL. */
export function textoListo(anotados: number, enlazados: number, pagos: number, sinAnotar: number): string {
  return `Listo: ${anotados} ${plural(anotados, 'anotado', 'anotados')}, ` +
    `${enlazados} ${plural(enlazados, 'enlazado', 'enlazados')} con lo que ya tenías, ` +
    `${pagos} ${plural(pagos, 'pago', 'pagos')} de tarjeta y ${sinAnotar} sin anotar.`;
}

export function yaEstabanImportados(n: number): string {
  return n === 1 ? '1 ya estaba importado.' : `${n} ya estaban importados.`;
}
