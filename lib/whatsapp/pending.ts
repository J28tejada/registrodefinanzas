/**
 * El corazón determinista del flujo (§5.1 y §5.4).
 *
 * Nada de lo que hay acá pasa por el modelo: la respuesta del usuario se
 * clasifica en código y el payload guardado se aplica tal cual se propuso.
 */
import { createTransaction, getLedgerById } from '@/lib/db';
import { formatCurrency, TransactionScope } from '@/lib/types';
import { cerrarPendiente } from './db';
import { fechaCorta } from './config';
import { MovimientoPropuesto, PendingAction, WhatsappNumber, tipoToTransactionType } from './types';

// ─── Clasificación de respuestas ──────────────────────────────────────────────

const VS16 = '️'; // selector de variación que traen muchos emoji

const EMOJI_SI = new Set(['\u{1F44D}', '\u{1F44C}', '✅', '✔', '\u{1F64C}', '\u{1F4AF}', '☑', '\u{1F197}']);
const EMOJI_NO = new Set(['\u{1F44E}', '❌', '\u{1F6AB}', '✖', '\u{1F645}']);

/** minúsculas, sin acentos, sin signos, espacios colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function soloEmojisDe(texto: string, set: Set<string>): boolean {
  const utiles = [...texto.replace(/\s/g, '')].filter(c => c !== VS16);
  return utiles.length > 0 && utiles.every(c => set.has(c));
}

const FRASES_SI = new Set([
  'si', 'sisi', 'si si', 'sip', 'sii', 'siii', 'yes', 'yep', 'ya',
  'dale', 'dale si', 'si dale', 'ok dale', 'dale ok', 'dale pues',
  'ok', 'oka', 'okey', 'okay', 'okis', 'vale', 'va', 'va que va',
  'listo', 'listo si', 'correcto', 'correcto si', 'exacto', 'exactamente',
  'confirmo', 'confirmado', 'confirmar', 'perfecto', 'claro', 'claro que si',
  'si claro', 'si porfa', 'si por favor', 'porfa', 'asi es', 'esta bien',
  'ta bien', 'esta correcto', 'anotalo', 'anota', 'anotala', 'si anotalo',
  'guardalo', 'guarda', 'si guardalo', 'hazlo', 'hacelo', 'adelante',
  'de una', 'obvio', 'aja', 'sale', 'simon', 'por supuesto', 'afirmativo',
  'si senor', 'todo bien', 'asi mismo', 'tal cual',
]);

const FRASES_NO = new Set([
  'no', 'no no', 'nop', 'nope', 'nel', 'negativo', 'nunca',
  'cancela', 'cancelar', 'cancelalo', 'cancelado', 'cancelalo porfa',
  'no cancela', 'no cancelalo', 'no borralo', 'no olvidalo', 'ya no',
  'mejor no', 'no gracias', 'no porfa', 'no por favor',
  'olvidalo', 'olvida', 'olvidalo porfa', 'borralo', 'borra', 'borralo porfa',
  'no anotes', 'no lo anotes', 'no anotar', 'ni modo', 'para', 'parale',
  'detente', 'nada', 'asi no', 'esta mal', 'mal', 'incorrecto', 'error',
  'no es', 'no era', 'nada que ver', 'dejalo', 'dejalo asi',
]);

/**
 * 'si' | 'no' | null. Solo mensajes de hasta 3 palabras y por frase completa:
 * "sí pero eran 300" es una corrección, no una confirmación, y "no eran 300"
 * tampoco es un rechazo. Ante la duda devuelve null y decide el modelo.
 */
export function claseRespuesta(body: string): 'si' | 'no' | null {
  const bruto = body.trim();
  if (soloEmojisDe(bruto, EMOJI_SI)) return 'si';
  if (soloEmojisDe(bruto, EMOJI_NO)) return 'no';

  const texto = normalizar(bruto);
  if (!texto) return null;
  if (texto.split(' ').length > 3) return null;
  if (FRASES_SI.has(texto)) return 'si';
  if (FRASES_NO.has(texto)) return 'no';
  return null;
}

const TOKENS_JUNTOS = ['juntos', 'junto', 'juntas', 'junta', 'juntalos', 'juntalas', 'sumalo', 'sumalos', 'sumado', 'suma', 'uno', 'total', 'entero', 'unico'];
const TOKENS_SEPARADOS = ['separados', 'separado', 'separadas', 'separada', 'separalos', 'separalas', 'separa', 'aparte', 'individual', 'individuales', 'divididos', 'dividido', 'divide', 'dividelos', 'independientes'];

/**
 * 'juntos' | 'separados' | null para la pregunta de agrupación (§5.4).
 * Acá sí alcanza con buscar la palabra clave: el universo de respuestas es
 * chico y los dos conjuntos no se pisan.
 */
export function claseAgrupacion(body: string): 'juntos' | 'separados' | null {
  const texto = normalizar(body);
  if (!texto) return null;
  const palabras = texto.split(' ');
  if (palabras.length > 3) return null;

  // "cada uno" trae 'uno', que suena a juntos pero significa lo contrario.
  if (texto.includes('cada uno') || texto.includes('uno por uno')) return 'separados';

  const juntos = palabras.some(p => TOKENS_JUNTOS.includes(p));
  const separados = palabras.some(p => TOKENS_SEPARADOS.includes(p));
  if (juntos && !separados) return 'juntos';
  if (separados && !juntos) return 'separados';
  return null;
}

// ─── Resúmenes ────────────────────────────────────────────────────────────────

export function necesitaAgrupacion(movs: MovimientoPropuesto[]): boolean {
  return movs.some(m => m.cantidad > 1 && m.agrupar === null);
}

function describirMovimiento(m: MovimientoPropuesto): string {
  const clase = m.tipo === 'gasto' ? 'gasto' : 'ingreso';
  const total = m.monto * m.cantidad;
  let linea: string;

  if (m.cantidad > 1 && m.agrupar === null) {
    linea = `${m.cantidad} × ${m.descripcion} de ${formatCurrency(m.monto)} c/u`;
  } else if (m.cantidad > 1 && m.agrupar) {
    linea = `${clase} de ${formatCurrency(total)} en ${m.descripcion} (${m.cantidad} unidades)`;
  } else if (m.cantidad > 1) {
    linea = `${m.cantidad} ${clase}s de ${formatCurrency(m.monto)} en ${m.descripcion}`;
  } else {
    linea = `${clase} de ${formatCurrency(m.monto)} en ${m.descripcion}`;
  }

  const meta = [m.categoria, fechaCorta(m.fecha), m.metodo_pago].filter(Boolean).join(', ');
  return `${linea} (${meta})`;
}

/** El texto que ve el modelo y que se le transmite al usuario. */
export function resumirMovimientos(movs: MovimientoPropuesto[]): string {
  const lineas = movs.map(describirMovimiento);
  const base = lineas.length === 1 ? lineas[0] : lineas.map(l => `• ${l}`).join('\n');

  const pendienteAgrupar = movs.find(m => m.cantidad > 1 && m.agrupar === null);
  if (pendienteAgrupar) {
    const { cantidad, monto } = pendienteAgrupar;
    return `${base}\n¿Lo anoto como ${cantidad} registros de ${formatCurrency(monto)} o uno solo de ${formatCurrency(monto * cantidad)}? (separados / juntos)`;
  }
  return base;
}

// ─── Aplicar y cancelar ───────────────────────────────────────────────────────

/**
 * Escribe la pendiente exactamente como fue propuesta y devuelve un mensaje que
 * dice qué quedó guardado y dónde (§5.6: el mensaje lleva el dato que
 * desambigua).
 */
export async function aplicar(pendiente: PendingAction, numero: WhatsappNumber): Promise<string> {
  const ledger = numero.ledger_id ? await getLedgerById(numero.ledger_id) : null;
  const scope: TransactionScope = ledger?.type ?? 'personal';
  const movs = pendiente.payload.movimientos;

  const lineas: string[] = [];
  for (const m of movs) {
    // Si quedó sin decidir, el default es agrupar: el monto total no cambia.
    const agrupar = m.cantidad > 1 ? m.agrupar !== false : true;
    const veces = agrupar ? 1 : m.cantidad;
    const monto = agrupar ? m.monto * m.cantidad : m.monto;
    const descripcion = agrupar && m.cantidad > 1 ? `${m.descripcion} (×${m.cantidad})` : m.descripcion;

    for (let i = 0; i < veces; i++) {
      await createTransaction({
        ledger_id: numero.ledger_id,
        type: tipoToTransactionType(m.tipo),
        scope,
        amount: monto,
        category: m.categoria,
        description: descripcion,
        date: m.fecha,
        source: 'whatsapp',
        receipt_url: m.receipt_url ?? null,
        payment_method: m.metodo_pago ?? null,
      });
    }

    const signo = m.tipo === 'gasto' ? '−' : '+';
    const detalle = `${signo}${formatCurrency(monto)} · ${descripcion} · ${m.categoria} · ${fechaCorta(m.fecha)}`;
    lineas.push(veces > 1 ? `${veces} × ${detalle}` : detalle);
  }

  await cerrarPendiente(pendiente.id, 'confirmed');

  const destino = ledger ? ledger.name : 'sin cuenta asignada';
  return `Listo ✅\n${lineas.map(l => `• ${l}`).join('\n')}\nGuardado en: ${destino}`;
}

export async function cancelar(pendiente: PendingAction): Promise<string> {
  await cerrarPendiente(pendiente.id, 'cancelled');
  return `Cancelado, no anoté nada ❌\n(era: ${pendiente.summary.split('\n')[0]})`;
}
