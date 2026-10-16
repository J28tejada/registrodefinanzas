/**
 * Los textos de la importación que no dependen de la pantalla.
 *
 * Viven acá, compartidos, por la misma razón que todo `lib/`: la web y el
 * teléfono tienen que decir exactamente lo mismo, y `verificar-textos` lo
 * comprueba. Están en impersonal y con el verbo de la app ('anotar'), como el
 * resto de las pantallas: solo el asistente habla en primera persona.
 */
import type { CodigoDeImportacion, CodigoDeLectura, MotivoNoCuadra } from './tipos';

/** El tope del PDF, controlado en el cliente antes de subir y otra vez en el servidor. */
export const LIMITE_PDF_BYTES = 3 * 1024 * 1024;

/** Qué parte no cuadró, dicho para una persona. */
export const MOTIVOS_NO_CUADRA: Record<MotivoNoCuadra, string> = {
  apertura: 'el saldo anterior',
  conteo: 'la cantidad de movimientos',
  totales: 'los totales',
  saldo: 'el saldo',
  cierre: 'el saldo al corte',
  signo: 'un débito y un crédito',
  fechas: 'las fechas',
};

export const MENSAJES_DE_LECTURA: Record<CodigoDeLectura, string> = {
  NO_ES_PDF: 'Ese archivo no es un PDF.',
  MUY_GRANDE: 'El PDF pesa más de 3 MB. ¿Seguro que es un estado de cuenta?',
  CLAVE_REQUERIDA: 'Este PDF tiene contraseña.',
  CLAVE_INCORRECTA: 'Esa contraseña no abre el PDF.',
  SIN_TEXTO:
    'Este PDF es una imagen escaneada y no tiene texto para leer. Bajalo de nuevo desde la banca en línea.',
  FORMATO_DESCONOCIDO:
    'Este estado de cuenta todavía no se sabe leer. Por ahora: cuentas de ahorro y corrientes del Banco Popular.',
  NO_CUADRA:
    'Se leyó, pero no cuadra con los saldos del banco. No se importa nada para no anotar montos equivocados.',
  MUY_LARGO: 'El PDF tiene demasiadas páginas para ser un estado de cuenta mensual.',
  ILEGIBLE: 'No se pudo leer este PDF. Probá bajarlo de nuevo del banco.',
};

/**
 * El mensaje de "no cuadra" con el detalle de qué y dónde. El motivo y la fecha
 * son lo único útil para quien lo lee: le dice que no es un problema del PDF
 * sino una línea que no se entendió.
 */
export function mensajeNoCuadra(motivo?: MotivoNoCuadra, fechaLegible?: string): string {
  if (!motivo) return MENSAJES_DE_LECTURA.NO_CUADRA;
  const donde = fechaLegible ? `, el ${fechaLegible}` : '';
  return `Se leyó, pero no cuadra con los saldos del banco (${MOTIVOS_NO_CUADRA[motivo]}${donde}). ` +
    'No se importa nada para no anotar montos equivocados.';
}

export const ERRORES_DE_IMPORTACION: Record<CodigoDeImportacion, string> = {
  NO_AUTENTICADO: 'Tenés que iniciar sesión.',
  NO_CUADRA: 'El estado de cuenta no cuadra con lo que se mandó a importar. No se anotó nada.',
  FECHA_INVALIDA: 'Una fecha del estado de cuenta no tiene sentido. No se anotó nada.',
  DECISION_INVALIDA: 'Hay una línea con una decisión que no se entiende. No se anotó nada.',
  SIGNO_INVALIDO: 'Hay un débito anotado como ingreso o al revés. No se anotó nada.',
  NETO_INVALIDO: 'Una devolución no coincide con su compra. No se anotó nada.',
  CUENTA_INVALIDA: 'Esa cuenta del banco no es tuya o no coincide con el estado. No se anotó nada.',
  LIBRO_INVALIDO: 'No tenés acceso a la cuenta donde se iba a anotar. No se anotó nada.',
  CATEGORIA_INVALIDA: 'Hay una categoría que no existe en esa cuenta. No se anotó nada.',
  TARJETA_INVALIDA: 'El pago de tarjeta apunta a una tarjeta de crédito que no es tuya. No se anotó nada.',
  MOVIMIENTO_INVALIDO: 'Una línea apunta a un movimiento que ya no existe. No se anotó nada.',
  YA_ENLAZADO: 'Dos líneas apuntan al mismo movimiento ya anotado. No se anotó nada.',
  REINTENTAR: 'Otra importación estaba en curso. Probá de nuevo.',
};

export const ERROR_DE_IMPORTACION_GENERICO = 'No se pudo importar. No se anotó nada; probá de nuevo.';

export const FALTA_MIGRACION =
  'Falta actualizar la base de datos (migración 0024). Hasta entonces se puede leer el estado de cuenta pero no importarlo.';
