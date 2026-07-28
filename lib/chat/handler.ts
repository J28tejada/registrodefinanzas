/**
 * El camino que recorre todo mensaje entrante, venga de donde venga:
 *
 *   1. ¿código de vinculación?      → vincular conversación ↔ usuario
 *   2. ¿conversación autorizada?    → si no, invitar a vincular
 *   3. ¿responde a algo pendiente?  → APLICAR (determinista, sin modelo)
 *   4. correr el agente
 *
 * El paso 3 va ANTES del modelo a propósito: un "sí" es el mensaje más
 * repetido del flujo y no debe gastar una llamada ni depender de que el modelo
 * recuerde qué propuso.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { getLedgerById, getSettings } from '@/lib/db';
import { TransactionScope } from '@/lib/types';
import { makeFormatters } from '@/lib/format';
import { MODEL } from './config';
import { actualizarPendiente, consumeLinkCode, getLink, pendienteVigente } from './db';
import { CuotaAgotadaError, ModeloNoDisponibleError, correrAgente } from './agent';
import {
  aplicar,
  cancelar,
  claseAgrupacion,
  claseRespuesta,
  necesitaAgrupacion,
  resumirMovimientos,
} from './pending';
import { CHANNEL_LABEL, Channel, ChatLink, Contexto } from './types';

export interface Entrada {
  supabase: SupabaseClient;
  channel: Channel;
  externalId: string;
  texto: string;
  /** "🎤 Escuché: ..." o "🧾 Leí: ...", para que revise antes de confirmar. */
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

/** Arma todo lo que hace falta para atender esta conversación. */
export async function construirContexto(
  supabase: SupabaseClient,
  link: ChatLink,
): Promise<Contexto> {
  const db = { supabase, userId: link.user_id };
  const settings = await getSettings(db);
  const ledger = link.ledger_id ? await getLedgerById(db, link.ledger_id) : null;
  const scope: TransactionScope = ledger?.type ?? 'personal';
  return { db, link, settings, fmt: makeFormatters(settings), ledger, scope };
}

export async function handleInboundMessage(entrada: Entrada): Promise<string> {
  const { supabase, channel, externalId, texto, eco, receiptUrl } = entrada;

  // 1. Código de vinculación
  const link = await getLink(supabase, channel, externalId);
  if (!link) {
    const codigo = posibleCodigo(texto);
    if (codigo) {
      const vinculado = await consumeLinkCode(supabase, codigo, channel, externalId);
      if (vinculado) {
        const ctx = await construirContexto(supabase, vinculado);
        return `Listo, quedaste vinculado ✅\nVoy a anotar en: ${ctx.ledger?.name ?? 'todas las cuentas'}, en ${ctx.settings.currency}.\nMandame algo como "gasté 800 en el súper" y te lo confirmo antes de guardarlo.`;
      }
      return 'Ese código no sirve: o ya se usó o venció (duran 15 minutos). Generá uno nuevo en la app.';
    }
  }

  // 2. ¿Autorizada?
  if (!link) {
    return `Esta conversación no está vinculada a ninguna cuenta, así que no puedo anotar nada.\nEntrá a la app → ${CHANNEL_LABEL[channel]}, generá el código de 6 letras y mandámelo por acá.`;
  }

  const ctx = await construirContexto(supabase, link);

  // 3. ¿Responde a algo pendiente?
  const pendiente = await pendienteVigente(supabase, channel, externalId);
  if (pendiente) {
    const movs = pendiente.payload.movimientos ?? [];

    if (necesitaAgrupacion(movs)) {
      // La pregunta de agrupación hace de confirmación.
      const agrupacion = claseAgrupacion(texto);
      if (agrupacion) {
        const resueltos = movs.map(m => (m.cantidad > 1 ? { ...m, agrupar: agrupacion === 'juntos' } : m));
        const actualizada = await actualizarPendiente(
          supabase,
          pendiente.id,
          { movimientos: resueltos },
          resumirMovimientos(resueltos, ctx),
        );
        return conEco(eco, await aplicar(actualizada, ctx));
      }
      const clase = claseRespuesta(texto);
      if (clase === 'no') return conEco(eco, await cancelar(pendiente, ctx));
      if (clase === 'si') {
        // Un "sí" no resuelve la pregunta: hay que insistir, no adivinar.
        return conEco(eco, `${pendiente.summary}\nDecime "separados" o "juntos" y lo anoto.`);
      }
      // null → sigue al modelo: puede ser una corrección.
    } else {
      const clase = claseRespuesta(texto);
      if (clase === 'si') return conEco(eco, await aplicar(pendiente, ctx));
      if (clase === 'no') return conEco(eco, await cancelar(pendiente, ctx));
      // null → sigue al modelo: "sí pero eran 300" es una corrección.
    }
  }

  // 4. El agente
  try {
    const respuesta = await correrAgente(ctx, texto, receiptUrl);
    return conEco(eco, respuesta.texto);
  } catch (err) {
    return conEco(eco, mensajeDeError(err, pendiente !== null));
  }
}

/**
 * Todo mensaje dice lo que el sistema sabe. "Uy, tuve un problema" es carísimo
 * de diagnosticar para alguien que no puede abrir los logs.
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
