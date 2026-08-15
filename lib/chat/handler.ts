/**
 * El camino que recorre todo mensaje entrante, venga de donde venga:
 *
 *   1. ¿código de vinculación?      → vincular conversación ↔ usuario
 *   2. ¿conversación autorizada?    → si no, invitar a vincular
 *   3. ¿dice cómo quiere que le llamen? → guardarlo
 *   4. ¿responde a algo pendiente?  → APLICAR (determinista, sin modelo)
 *   5. correr el agente
 *
 * El paso 4 va ANTES del modelo a propósito: un "sí" es el mensaje más
 * repetido del flujo y no debe gastar una llamada ni depender de que el modelo
 * recuerde qué propuso.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { getAllLedgersWithStats, getLedgerById, getLedgerRole, getSettings } from '@/lib/db';
import { TransactionScope } from '@/lib/types';
import { makeFormatters } from '@/lib/format';
import {
  actualizarPendiente, consumeLinkCode, getLink, getPreferredName,
  pendienteVigente, setLinkLedger, setPreferredName,
} from './db';
import {
  CuotaAgotadaError, ModeloNoDisponibleError, ServicioSaturadoError, correrAgente,
} from './agent';
import {
  aplicar,
  cancelar,
  claseAgrupacion,
  claseRespuesta,
  extraerNombre,
  elegirCuenta,
  necesitaAgrupacion,
  preguntarCuenta,
  resumirMovimientos,
} from './pending';
import { leDirigeLaPalabra } from './grupos';
import { CHANNEL_LABEL, Channel, ChatLink, Contexto } from './types';

export interface Entrada {
  supabase: SupabaseClient;
  channel: Channel;
  externalId: string;
  texto: string;
  /** El mensaje responde a uno del bot: en un grupo, eso lo interpela. */
  respondeAlBot?: boolean;
  /** "🎤 Escuché: ..." o "🧾 Leí: ...", para que revise antes de confirmar. */
  eco: string | null;
  receiptUrl: string | null;
  /** Quién escribió, si `externalId` es un grupo. */
  participant?: string | null;
  esGrupo?: boolean;
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

/**
 * Arma todo lo que hace falta para atender esta conversación.
 *
 * En un grupo, `link` trae la cuenta (del vínculo del grupo) pero el `user_id`
 * ya viene reemplazado por el de quien escribió: así el gasto queda a nombre
 * de esa persona, y su moneda y zona horaria son las suyas.
 */
export async function construirContexto(
  supabase: SupabaseClient,
  link: ChatLink,
  participant: string | null = null,
): Promise<Contexto> {
  const db = { supabase, userId: link.user_id };
  const [settings, nombre] = await Promise.all([
    getSettings(db),
    getPreferredName(supabase, link.user_id),
  ]);
  const ledger = link.ledger_id ? await getLedgerById(db, link.ledger_id) : null;
  const scope: TransactionScope = ledger?.type ?? 'personal';
  return { db, link, settings, fmt: makeFormatters(settings), ledger, scope, nombre, participant };
}

export async function handleInboundMessage(entrada: Entrada): Promise<string | null> {
  const { supabase, channel, externalId, texto, eco, receiptUrl } = entrada;
  const esGrupo = entrada.esGrupo === true;
  const participant = entrada.participant ?? null;

  // 1. Código de vinculación
  const link = await getLink(supabase, channel, externalId);
  if (!link) {
    const codigo = posibleCodigo(texto);
    if (codigo) {
      const vinculado = await consumeLinkCode(supabase, codigo, channel, externalId, esGrupo);
      if (vinculado) {
        if (esGrupo) {
          const ctxG = await construirContexto(supabase, vinculado);
          return ctxG.ledger
            ? `Listo, este grupo quedó vinculado a *${ctxG.ledger.name}* ✅\n`
              + 'Cada quien tiene que vincular su chat privado conmigo para que sus gastos queden a su nombre.\n'
              + 'Mandá algo como "gasté 800 en el súper" y te lo confirmo antes de guardarlo.'
            : 'El grupo quedó vinculado, pero el código no traía cuenta. Generá uno nuevo eligiendo a qué cuenta van los gastos del grupo.';
        }
        const ctx = await construirContexto(supabase, vinculado);
        // "todas las cuentas" era mentira: sin cuenta no hay dónde anotar, así
        // que se avisa que se va a preguntar en el primer movimiento.
        const destino = ctx.ledger
          ? `Voy a anotar en tu cuenta *${ctx.ledger.name}*, en ${ctx.settings.currency}.`
          : `Todavía no elegiste cuenta: te la pregunto en el primer movimiento. Moneda: ${ctx.settings.currency}.`;

        // Se pregunta el nombre acá y no más tarde: es el único momento en que
        // no hay nada más en curso que se pueda confundir con la respuesta.
        const yaTieneNombre = await getPreferredName(supabase, vinculado.user_id);
        const pedirNombre = yaTieneNombre
          ? `Mandame algo como "gasté 800 en el súper" y te lo confirmo antes de guardarlo.`
          : `Antes de empezar: ¿cómo querés que te llame?`;

        return `Listo, quedaste vinculado ✅\n${destino}\n${pedirNombre}`;
      }
      return 'Ese código no sirve: o ya se usó o venció (duran 15 minutos). Generá uno nuevo en la app.';
    }
  }

  // 2. ¿Autorizada?
  if (!link) {
    return `Esta conversación no está vinculada a ninguna cuenta, así que no puedo anotar nada.\nEntrá a la app → ${CHANNEL_LABEL[channel]}, generá el código de 6 letras y mandámelo por acá.`;
  }

  // 2b. En un grupo, quién habla no es la conversación.
  //
  // El vínculo del grupo dice a qué cuenta van los gastos; a quién se le
  // atribuye cada uno sale del vínculo individual de quien escribió. Sin eso
  // todo quedaría a nombre de quien vinculó el grupo, y se pierde el dato que
  // justamente se quiere ver: quién gastó qué.
  let linkEfectivo = link;
  if (esGrupo) {
    if (!link.ledger_id) {
      return 'Este grupo no tiene cuenta asignada, así que no sé dónde anotar. '
        + 'Volvé a vincularlo desde la app eligiendo a qué cuenta van los gastos.';
    }

    const linkPersona = participant ? await getLink(supabase, channel, participant) : null;
    if (!linkPersona) {
      return 'No te tengo vinculado todavía, así que no puedo anotar tus gastos a tu nombre.\n'
        + `Escribime por privado y mandame el código de 6 letras que sacás de la app → ${CHANNEL_LABEL[channel]}.`;
    }

    // Estar en el grupo no alcanza: hay que tener acceso a esa cuenta.
    const rol = await getLedgerRole({ supabase, userId: linkPersona.user_id }, link.ledger_id);
    if (!rol) {
      return 'Estás en el grupo pero no tenés acceso a la cuenta donde anota. '
        + 'Pedile al dueño que te invite desde la app.';
    }

    // La cuenta la manda el grupo; la identidad, la persona.
    linkEfectivo = { ...link, user_id: linkPersona.user_id };

    // En un grupo la mayoría de los mensajes son entre las personas. Sin este
    // filtro el bot contesta a cada "jaja" —una llamada al modelo por mensaje—
    // y el grupo se vuelve inusable. Se consulta el pendiente ANTES de decidir:
    // un "sí" suelto es charla, salvo que haya algo esperando confirmación.
    const pendienteEnGrupo = await pendienteVigente(supabase, channel, externalId, participant);
    const paraElBot = leDirigeLaPalabra({
      texto,
      hayPendiente: pendienteEnGrupo !== null,
      interpelaAlBot: entrada.respondeAlBot === true,
      esMedia: eco !== null,
    });
    if (!paraElBot) return null;
  }

  let ctx = await construirContexto(supabase, linkEfectivo, participant);

  // 3. ¿Está contestando cómo quiere que le llamen?
  //
  // Solo cuando no hay nada pendiente: si lo hay, ese mensaje contesta a la
  // confirmación y no al nombre. `extraerNombre` además descarta lo que parezca
  // un movimiento, así que un "gasté 800" acá sigue de largo hacia el agente.
  const pendienteAntes = await pendienteVigente(supabase, channel, externalId, participant);
  if (!pendienteAntes && !(await getPreferredName(supabase, linkEfectivo.user_id))) {
    const nombre = extraerNombre(texto);
    if (nombre) {
      await setPreferredName(supabase, linkEfectivo.user_id, nombre);
      const cuenta = ctx.ledger
        ? `Anoto en tu cuenta *${ctx.ledger.name}*.`
        : 'En el primer movimiento te pregunto en qué cuenta anotarlo.';
      return conEco(eco,
        `Un gusto, ${nombre} 👋\n${cuenta}\n`
        + 'Mandame algo como "gasté 800 en el súper" y te lo confirmo antes de guardarlo.');
    }
  }

  // 4. ¿Responde a algo pendiente?
  const pendiente = pendienteAntes;
  if (pendiente) {
    const movs = pendiente.payload.movimientos ?? [];

    // Sin cuenta el movimiento quedaría huérfano: no aparece en ninguna vista
    // ni suma a ningún saldo. Se pregunta antes de guardar, no después.
    if (!ctx.ledger) {
      if (claseRespuesta(texto) === 'no') return conEco(eco, await cancelar(pendiente, ctx));

      const cuentas = await getAllLedgersWithStats(ctx.db);
      if (cuentas.length === 0) {
        // Cada usuario arranca con una cuenta personal, así que llegar acá
        // significa que las borró todas.
        return conEco(eco,
          'Te quedaste sin cuentas, así que no hay dónde anotarlo.\n'
          + 'Creá una en la app y volvé a mandarme el movimiento.');
      }

      const elegida = elegirCuenta(texto, cuentas);
      if (!elegida) return conEco(eco, preguntarCuenta(cuentas, pendiente.summary));

      // Queda fija: preguntarlo en cada gasto sería insoportable.
      await setLinkLedger(supabase, linkEfectivo.user_id, linkEfectivo.id, elegida);
      ctx = await construirContexto(supabase, { ...linkEfectivo, ledger_id: elegida }, participant);

      // Elegir la cuenta vale como confirmación, igual que responder la
      // pregunta de agrupación.
      if (necesitaAgrupacion(movs)) return conEco(eco, resumirMovimientos(movs, ctx));
      return conEco(eco, await aplicar(pendiente, ctx));
    }

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

  // 5. El agente
  try {
    const respuesta = await correrAgente(ctx, texto, receiptUrl);
    return conEco(eco, respuesta.texto);
  } catch (err) {
    return conEco(eco, mensajeDeError(err, pendiente !== null));
  }
}

/**
 * El usuario recibe qué pasó y qué hacer; el detalle técnico va al log.
 *
 * Antes se le mandaba el error crudo, con el argumento de que "Uy, tuve un
 * problema" es imposible de diagnosticar para quien no puede abrir los logs.
 * El argumento era bueno pero la solución estaba mal: terminaba mandando cosas
 * como `[GoogleGenerativeAI Error]: ... 503 Service Unavailable` a alguien que
 * solo quería anotar un gasto, y encima filtraba URLs internas y nombres de
 * modelo.
 *
 * La `ref` resuelve las dos cosas: el usuario la puede dictar y con eso se
 * encuentra el error exacto en el log, sin que el chat cargue con el detalle.
 */
function mensajeDeError(err: unknown, habiaPendiente: boolean): string {
  const colaPendiente = habiaPendiente
    ? '\nLo que estaba esperando confirmación sigue guardado: mandame "sí" y lo anoto igual.'
    : '';

  // El detalle técnico va al log, nunca al chat. La `ref` es lo que une las dos
  // puntas: el usuario la puede pasar y con eso se encuentra el error exacto.
  const ref = refDeError();
  console.error(`[chat] error ${ref}:`, err);

  if (err instanceof ServicioSaturadoError) {
    return `El servicio está sobrecargado en este momento y no pude interpretar el mensaje. Probá de nuevo en un minuto.${colaPendiente}`;
  }
  if (err instanceof CuotaAgotadaError) {
    return `Llegué al límite de mensajes por hoy, así que no puedo interpretar más. Vuelve mañana; mientras tanto podés anotarlo desde la app.${colaPendiente}`;
  }
  if (err instanceof ModeloNoDisponibleError) {
    // No es algo que el usuario pueda resolver: se avisa sin nombrar variables
    // de entorno ni modelos.
    return `Tengo un problema de configuración y no puedo interpretar mensajes. Ya quedó registrado para revisarlo (ref ${ref}). Mientras tanto podés anotarlo desde la app.${colaPendiente}`;
  }
  return `No pude procesar el mensaje. Ya quedó registrado para revisarlo (ref ${ref}). Probá de nuevo, y si sigue igual anotalo desde la app.${colaPendiente}`;
}

/** Corta y fácil de dictar por chat: sirve para encontrar el error en el log. */
function refDeError(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
