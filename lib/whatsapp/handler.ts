/**
 * El camino que recorre todo mensaje entrante, en este orden (§2):
 *
 *   1. ¿código de vinculación?      → vincular teléfono ↔ app
 *   2. ¿número vinculado?           → si no, invitar a vincular
 *   3. ¿responde a algo pendiente?  → APLICAR (determinista, sin modelo)
 *   4. correr el agente
 *
 * El paso 3 va ANTES del modelo a propósito: un "sí" es el mensaje más
 * repetido del flujo y no debe gastar una llamada ni depender de que el modelo
 * recuerde qué propuso.
 */
import { getLedgerById } from '@/lib/db';
import { TransactionScope } from '@/lib/types';
import { MODEL } from './config';
import { consumeLinkCode, getNumberByPhone, pendienteVigente, actualizarPendiente } from './db';
import { CuotaAgotadaError, ModeloNoDisponibleError, correrAgente } from './agent';
import {
  aplicar,
  cancelar,
  claseAgrupacion,
  claseRespuesta,
  necesitaAgrupacion,
  resumirMovimientos,
} from './pending';

export interface Entrada {
  phone: string;
  texto: string;
  /** "🎤 Escuché: ..." o "🧾 Leí: ...", para que revise antes de confirmar (§5.7). */
  eco: string | null;
  receiptUrl: string | null;
}

const RE_CODIGO = /^[A-HJ-NP-Z2-9]{6}$/;

/** Busca un código de vinculación suelto en el mensaje. */
function posibleCodigo(texto: string): string | null {
  const tokens = texto.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (tokens.length > 3) return null;
  return tokens.find(t => RE_CODIGO.test(t)) ?? null;
}

function conEco(eco: string | null, cuerpo: string): string {
  return eco ? `${eco}\n\n${cuerpo}` : cuerpo;
}

export async function handleInboundMessage(entrada: Entrada): Promise<string> {
  const { phone, texto, eco, receiptUrl } = entrada;

  // 1. Código de vinculación
  const numero = await getNumberByPhone(phone);
  if (!numero) {
    const codigo = posibleCodigo(texto);
    if (codigo) {
      const vinculado = await consumeLinkCode(codigo, phone);
      if (vinculado) {
        const ledger = vinculado.ledger_id ? await getLedgerById(vinculado.ledger_id) : null;
        return `Listo, quedaste vinculado ✅\nVoy a anotar en: ${ledger?.name ?? 'todas las cuentas'}.\nMandame algo como "gasté 800 en el súper" y te lo confirmo antes de guardarlo.`;
      }
      return `Ese código no sirve: o ya se usó o venció (duran 15 minutos). Generá uno nuevo en la app, en la sección WhatsApp.`;
    }
  }

  // 2. ¿Vinculado?
  if (!numero) {
    return `Este número no está vinculado a la app, así que no puedo anotar nada todavía.\nAbrí la app → WhatsApp, generá el código de 6 letras y mandámelo por acá.`;
  }

  const ledger = numero.ledger_id ? await getLedgerById(numero.ledger_id) : null;
  const scope: TransactionScope = ledger?.type ?? 'personal';
  const nombreCuenta = ledger?.name ?? 'todas las cuentas';

  // 3. ¿Responde a algo pendiente?
  const pendiente = await pendienteVigente(phone);
  if (pendiente) {
    const movs = pendiente.payload.movimientos ?? [];

    if (necesitaAgrupacion(movs)) {
      // La pregunta de agrupación hace de confirmación (§5.4).
      const agrupacion = claseAgrupacion(texto);
      if (agrupacion) {
        const resueltos = movs.map(m => (m.cantidad > 1 ? { ...m, agrupar: agrupacion === 'juntos' } : m));
        const actualizada = await actualizarPendiente(
          pendiente.id,
          { movimientos: resueltos },
          resumirMovimientos(resueltos),
        );
        return conEco(eco, await aplicar(actualizada, numero));
      }
      const clase = claseRespuesta(texto);
      if (clase === 'no') return conEco(eco, await cancelar(pendiente));
      if (clase === 'si') {
        // Un "sí" no resuelve la pregunta: hay que insistir, no adivinar.
        return conEco(eco, `${pendiente.summary}\nDecime "separados" o "juntos" y lo anoto.`);
      }
      // null → sigue al modelo: puede ser una corrección.
    } else {
      const clase = claseRespuesta(texto);
      if (clase === 'si') return conEco(eco, await aplicar(pendiente, numero));
      if (clase === 'no') return conEco(eco, await cancelar(pendiente));
      // null → sigue al modelo: "sí pero eran 300" es una corrección.
    }
  }

  // 4. El agente
  try {
    const respuesta = await correrAgente(numero, scope, nombreCuenta, texto, receiptUrl);
    return conEco(eco, respuesta.texto);
  } catch (err) {
    return conEco(eco, mensajeDeError(err, pendiente !== null));
  }
}

/**
 * §5.6: todo mensaje dice lo que el sistema sabe. "Uy, tuve un problema" es
 * carísimo de diagnosticar para alguien que no puede abrir los logs.
 */
function mensajeDeError(err: unknown, habiaPendiente: boolean): string {
  const colaPendiente = habiaPendiente
    ? '\nLo que estaba esperando confirmación sigue guardado: mandame "sí" y lo anoto igual.'
    : '';

  if (err instanceof CuotaAgotadaError) {
    return `Se agotó la cuota del modelo (${MODEL}) por hoy, así que no pude interpretar el mensaje. La cuota es por día: mañana vuelve. Mientras tanto podés anotarlo desde la app.${colaPendiente}`;
  }
  if (err instanceof ModeloNoDisponibleError) {
    return `El modelo configurado (${MODEL}) no está disponible para esta llave de API, así que no pude interpretar el mensaje. Hay que cambiar GEMINI_MODEL.${colaPendiente}`;
  }
  const detalle = err instanceof Error ? err.message : String(err);
  return `No pude procesar el mensaje. Motivo: ${detalle.slice(0, 200)}${colaPendiente}`;
}
