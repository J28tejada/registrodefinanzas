/**
 * El agente: interpreta lenguaje natural y llama herramientas. Es el mismo para
 * todos los canales; lo único que cambia es por dónde entra y sale el texto.
 *
 * Regla que ordena todo el archivo: las herramientas NO escriben.
 * `registrar_movimiento` deja una acción pendiente y le devuelve al modelo un
 * texto que le prohíbe dar el registro por hecho. Quien escribe es el paso
 * determinista de `pending.ts`, cuando el usuario confirma.
 */
import {
  Content,
  FunctionDeclaration,
  GoogleGenerativeAI,
  Part,
  SchemaType,
} from '@google/generative-ai';
import { getAllTransactions, getBudgetProgress, getCategories, getSummary } from '@/lib/db';
import { TransactionScope } from '@/lib/types';
import { fechaValida, limitesDelMes } from '@/lib/format';
import { MODEL, geminiApiKey } from './config';
import { actualizarPendiente, crearPendiente, recentMessages } from './db';
import { resumirMovimientos } from './pending';
import { Contexto, MovimientoPropuesto } from './types';

const MAX_VUELTAS = 3;
const MAX_CANTIDAD = 100;

export class CuotaAgotadaError extends Error {}
export class ModeloNoDisponibleError extends Error {}
/** 503/500 del proveedor: no es culpa del mensaje, se puede reintentar. */
export class ServicioSaturadoError extends Error {}

// ─── Prompt del sistema ───────────────────────────────────────────────────────

/**
 * Corto a propósito: viaja en CADA llamada y con modelos chicos no llega al
 * mínimo cacheable, así que cada token de más se paga siempre.
 */
function systemPrompt(ctx: Contexto): string {
  const cuenta = ctx.ledger?.name ?? 'ninguna todavía (se le pregunta al confirmar)';
  // El nombre va en el prompt, no en las reglas: así lo usa al saludar sin que
  // haya que pedírselo en cada vuelta.
  const quien = ctx.nombre ? `Le decís ${ctx.nombre}.` : '';
  return `Asistente de finanzas personales. El usuario te manda notas cortas por chat, en español coloquial y con errores: entendelas y registralas con tus herramientas. Si pregunta por datos ya registrados, buscalos con "consultar"; si pregunta por topes de gasto, usá "presupuesto".
Cuenta activa: ${cuenta}. Moneda: ${ctx.settings.currency}. Ahora: ${ctx.fmt.now()}. ${quien}

REGLAS
1. Dinero: llamá la herramienta y transmití el resumen que devuelva preguntando "¿Lo anoto?". NO digas que quedó guardado: la confirmación la maneja el sistema.
2. Varias cosas en un mensaje: registralas todas y confirmá una sola vez.
3. Falta un dato: preguntalo, corto y concreto. Nunca inventes montos ni conceptos.
4. Fechas relativas ("ayer", "el viernes"): resolvelas con la fecha de arriba.
5. Si pregunta dónde anotás, de quién son los datos o si son los suyos: contale que anotás en la cuenta activa de arriba, que es suya, y que todo lo que consultás sale de sus propios movimientos. Nadie más los ve salvo a quien haya invitado a esa cuenta. Es una pregunta legítima: respondela derecho, sin evasivas.
6. Si preguntan quién cargó o pagó algo, mirá con "consultar": los movimientos vienen con el nombre de quien los anotó entre corchetes, y los que no lo traen son de quien te está escribiendo. Nunca lo adivines.
7. Respondé en español, cálido, 1-2 frases máximo. Sin tecnicismos ni IDs.`;
}

// ─── Herramientas ─────────────────────────────────────────────────────────────

/**
 * `agrupar` no está en el esquema a propósito: si el modelo puede decidir si 3
 * cafés de 150 son 450 o tres de 150, lo inventa. Esa pregunta va dentro de la
 * confirmación y la resuelve el código.
 */
function declaraciones(categorias: string[]): FunctionDeclaration[] {

  return [
    {
      name: 'registrar_movimiento',
      description: 'Propone anotar un gasto o ingreso. No lo guarda: el usuario lo confirma después.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          tipo: { type: SchemaType.STRING, enum: ['ingreso', 'gasto'], format: 'enum', description: 'ingreso o gasto' },
          monto: { type: SchemaType.NUMBER, description: 'Monto de CADA unidad, no el total' },
          descripcion: { type: SchemaType.STRING, description: 'Concepto concreto, ej. "Súper del sábado". Nunca "Gasto"' },
          categoria: { type: SchemaType.STRING, enum: categorias, format: 'enum', description: 'Categoría de la app' },
          fecha: { type: SchemaType.STRING, description: 'YYYY-MM-DD. Por defecto hoy' },
          metodo_pago: { type: SchemaType.STRING, description: 'efectivo, tarjeta, transferencia' },
          cantidad: { type: SchemaType.NUMBER, description: 'Cuántas unidades, ej. 3 cafés. Por defecto 1' },
        },
        // Nada entra sin concepto: requerida en el esquema, el modelo la
        // pregunta en vez de rellenar con "Gasto".
        required: ['tipo', 'monto', 'descripcion', 'categoria'],
      },
    },
    {
      name: 'consultar',
      description: 'Consulta los movimientos ya registrados del usuario.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          recurso: { type: SchemaType.STRING, enum: ['movimientos', 'categorias', 'balance'], format: 'enum', description: 'Qué mirar' },
          desde: { type: SchemaType.STRING, description: 'YYYY-MM-DD. Por defecto, inicio del mes actual' },
          hasta: { type: SchemaType.STRING, description: 'YYYY-MM-DD. Por defecto, hoy' },
          buscar: { type: SchemaType.STRING, description: 'Filtra por descripción o categoría' },
          limite: { type: SchemaType.NUMBER, description: 'Por defecto 5' },
        },
        required: ['recurso'],
      },
    },
    {
      name: 'presupuesto',
      description: 'Consulta los topes mensuales de gasto y cuánto lleva gastado en cada uno.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          categoria: { type: SchemaType.STRING, description: 'Una categoría concreta. Si se omite, devuelve todas' },
        },
        required: [],
      },
    },
  ];
}

// ─── Ejecución de herramientas ────────────────────────────────────────────────

interface Turno {
  ctx: Contexto;
  /** Comprobante de la foto que originó este turno, si hubo. */
  receiptUrl: string | null;
  /** Movimientos propuestos en este turno. */
  borradores: MovimientoPropuesto[];
  /** Id de la pendiente creada en este turno, para ir agregándole movimientos. */
  pendienteId: string | null;
  resumen: string;
  /**
   * Las del usuario, del ámbito de su cuenta, leídas una sola vez por turno.
   *
   * Antes salían de una constante del código. Ahora que se pueden crear y
   * renombrar, tienen que venir de la base: si no, el modelo no conocería
   * "Mascota" y seguiría ofreciendo un nombre que el usuario ya borró.
   */
  categorias: { expense: string[]; income: string[] };
}

function categoriaValida(valor: unknown, validas: string[]): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return validas.find(c => norm(c) === norm(valor)) ?? null;
}

async function registrarMovimiento(args: Record<string, unknown>, turno: Turno): Promise<string> {
  const { ctx } = turno;
  const tipo = args.tipo === 'ingreso' ? 'ingreso' : args.tipo === 'gasto' ? 'gasto' : null;
  if (!tipo) return 'ERROR: "tipo" tiene que ser "ingreso" o "gasto".';

  const monto = Number(args.monto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return 'ERROR: falta el monto o no es un número positivo. Preguntáselo al usuario.';
  }

  const descripcion = typeof args.descripcion === 'string' ? args.descripcion.trim() : '';
  if (!descripcion || descripcion.length < 3) {
    return 'ERROR: falta el concepto. Preguntale al usuario en qué fue exactamente. No lo inventes.';
  }

  const validas = turno.categorias[tipo === 'gasto' ? 'expense' : 'income'];
  const categoria = categoriaValida(args.categoria, validas);
  if (!categoria) {
    return `ERROR: "categoria" tiene que ser una de: ${validas.join(', ')}.`;
  }

  const cantidadCruda = Number(args.cantidad);
  const cantidad = Number.isFinite(cantidadCruda) && cantidadCruda >= 1
    ? Math.min(Math.floor(cantidadCruda), MAX_CANTIDAD)
    : 1;

  const movimiento: MovimientoPropuesto = {
    tipo,
    monto,
    descripcion,
    categoria,
    fecha: fechaValida(args.fecha, ctx.fmt.today()),
    metodo_pago: typeof args.metodo_pago === 'string' && args.metodo_pago.trim() ? args.metodo_pago.trim() : null,
    cantidad,
    // Lo decide el usuario, no el modelo.
    agrupar: cantidad > 1 ? null : true,
    receipt_url: turno.receiptUrl,
  };

  turno.borradores.push(movimiento);
  turno.resumen = resumirMovimientos(turno.borradores, ctx);

  // Se persiste ya: si el modelo se cae a mitad de turno (cuota, timeout), el
  // "sí" posterior aplica igual la acción.
  if (turno.pendienteId) {
    await actualizarPendiente(ctx.db.supabase, turno.pendienteId, { movimientos: turno.borradores }, turno.resumen);
  } else {
    const p = await crearPendiente(
      ctx.db.supabase,
      ctx.db.userId,
      ctx.link.channel,
      ctx.link.external_id,
      'registrar_movimientos',
      { movimientos: turno.borradores },
      turno.resumen,
      ctx.participant,
    );
    turno.pendienteId = p.id;
  }

  return `PENDIENTE: ${turno.resumen}\nPedile confirmación al usuario transmitiéndole ese resumen; no lo des por hecho ni digas que quedó guardado.`;
}

/** Texto compacto, no JSON: el resultado se paga como contexto. */
async function consultar(args: Record<string, unknown>, turno: Turno): Promise<string> {
  const { ctx } = turno;
  const hoy = ctx.fmt.today();
  const desde = fechaValida(args.desde, limitesDelMes(hoy).start);
  const hasta = fechaValida(args.hasta, hoy);
  const buscar = typeof args.buscar === 'string' && args.buscar.trim() ? args.buscar.trim() : undefined;
  const limiteCrudo = Number(args.limite);
  const limite = Number.isFinite(limiteCrudo) && limiteCrudo > 0 ? Math.min(Math.floor(limiteCrudo), 20) : 5;
  const recurso = args.recurso === 'categorias' || args.recurso === 'balance' ? args.recurso : 'movimientos';
  const ledgerId = ctx.link.ledger_id ?? undefined;

  const resumen = await getSummary(ctx.db, ledgerId, desde, hasta);
  const cabecera =
    `${desde}..${hasta}: ingresos ${Math.round(resumen.totalIncome)}, ` +
    `gastos ${Math.round(resumen.totalExpenses)}, balance ${Math.round(resumen.totalBalance)}`;

  if (recurso === 'balance') return `${cabecera}.`;

  if (recurso === 'categorias') {
    const gastos = resumen.byCategory.filter(c => c.type === 'expense').slice(0, 10);
    if (gastos.length === 0) return `${cabecera}. Sin gastos en el período.`;
    const detalle = gastos.map(c => `${c.category} ${Math.round(c.total)} (${c.count})`).join('; ');
    return `${cabecera}.\nGastos por categoría: ${detalle}`;
  }

  const movs = await getAllTransactions(ctx.db, {
    ledger_id: ledgerId,
    startDate: desde,
    endDate: hasta,
    search: buscar,
  });
  if (movs.length === 0) {
    return `${cabecera}, 0 movs${buscar ? ` que coincidan con "${buscar}"` : ''}.`;
  }
  // Quién lo cargó va en la respuesta: en una cuenta compartida "¿quién pagó
  // el súper?" es de las preguntas más naturales, y sin esto el modelo no
  // tendría con qué contestarla.
  const ultimos = movs.slice(0, limite)
    .map(t => {
      const autor = t.author_name && t.author_id !== ctx.db.userId ? ` [${t.author_name}]` : '';
      return `${t.date.slice(5)} ${t.type === 'income' ? '+' : '-'}${Math.round(t.amount)} ${t.description}${autor}`;
    })
    .join('; ');
  return `${cabecera}, ${movs.length} movs.\n`
    + `Últimos (entre corchetes va quién lo cargó, si no fuiste vos): ${ultimos}`;
}

async function presupuesto(args: Record<string, unknown>, turno: Turno): Promise<string> {
  const { ctx } = turno;
  const { start, end } = limitesDelMes(ctx.fmt.today());
  const progreso = await getBudgetProgress(ctx.db, start, end);

  if (progreso.length === 0) {
    return 'El usuario no tiene presupuestos configurados. Puede ponerlos en la app, sección Presupuestos.';
  }

  const filtro = typeof args.categoria === 'string' ? args.categoria.trim().toLowerCase() : '';
  const filtrados = filtro
    ? progreso.filter(b => b.category.toLowerCase().includes(filtro))
    : progreso;

  if (filtrados.length === 0) {
    return `No hay presupuesto para "${args.categoria}". Los que hay: ${progreso.map(b => b.category).join(', ')}.`;
  }

  const detalle = filtrados
    .map(b => `${b.category} ${Math.round(b.spent)}/${Math.round(b.amount)} (${b.percent}%${b.percent >= 100 ? ', PASADO' : ''})`)
    .join('; ');
  return `Presupuestos ${start}..${end}: ${detalle}`;
}

// ─── Bucle del agente ─────────────────────────────────────────────────────────

function historial(mensajes: { direction: 'in' | 'out'; body: string }[]): Content[] {
  const hist: Content[] = [];
  for (const m of mensajes) {
    const role = m.direction === 'in' ? 'user' : 'model';
    // Gemini exige que el historial arranque con el usuario.
    if (hist.length === 0 && role === 'model') continue;
    const ultimo = hist[hist.length - 1];
    if (ultimo?.role === role) ultimo.parts.push({ text: m.body });
    else hist.push({ role, parts: [{ text: m.body }] });
  }
  return hist;
}

function traducirError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return new CuotaAgotadaError(msg);
  if (/404|not found|is not supported/i.test(msg)) return new ModeloNoDisponibleError(msg);
  if (/503|502|500|overloaded|unavailable|internal error/i.test(msg)) {
    return new ServicioSaturadoError(msg);
  }
  return err instanceof Error ? err : new Error(msg);
}

/** Distinto de la cuota: acá el modelo está saturado y en segundos se recupera. */
function esTransitorio(err: unknown): boolean {
  return traducirError(err) instanceof ServicioSaturadoError;
}

const REINTENTOS = 2;
const ESPERA_BASE_MS = 700;

/**
 * Reintenta solo los fallos transitorios. Un 503 de Gemini es lo bastante
 * frecuente como para que rendirse en el primer intento se note: el usuario
 * manda un gasto y recibe un error por algo que se arreglaba solo.
 */
async function conReintentos<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    try {
      return await fn();
    } catch (err) {
      ultimo = err;
      if (!esTransitorio(err) || intento === REINTENTOS) break;
      await new Promise(r => setTimeout(r, ESPERA_BASE_MS * 2 ** intento));
    }
  }
  throw ultimo;
}

export interface RespuestaAgente {
  texto: string;
  /** true si quedó una acción esperando confirmación. */
  dejoPendiente: boolean;
}

export async function correrAgente(
  ctx: Contexto,
  texto: string,
  receiptUrl: string | null,
): Promise<RespuestaAgente> {
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error('Falta GOOGLE_AI_API_KEY: el agente no puede interpretar mensajes.');

  // Del ámbito de la cuenta activa: las de negocio no tienen sentido en una
  // cuenta personal, y mandarlas todas al modelo es enum de más en cada llamada.
  const [gastos, ingresos] = await Promise.all([
    getCategories(ctx.db, { type: 'expense', scope: ctx.scope }),
    getCategories(ctx.db, { type: 'income', scope: ctx.scope }),
  ]);

  const turno: Turno = {
    ctx,
    receiptUrl,
    borradores: [],
    pendienteId: null,
    resumen: '',
    categorias: {
      expense: gastos.map(c => c.name),
      income: ingresos.map(c => c.name),
    },
  };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt(ctx),
    tools: [{ functionDeclarations: declaraciones([...turno.categorias.expense, ...turno.categorias.income]) }],
  });

  // El mensaje actual ya está en la bitácora: entra aparte, no en el historial.
  const previos = (await recentMessages(ctx.db.supabase, ctx.link.channel, ctx.link.external_id, 11, ctx.participant)).slice(0, -1);
  const chat = model.startChat({ history: historial(previos) });

  try {
    let result = await conReintentos(() => chat.sendMessage(texto));

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const llamadas = result.response.functionCalls() ?? [];
      if (llamadas.length === 0) break;

      const respuestas: Part[] = [];
      for (const llamada of llamadas) {
        const args = (llamada.args ?? {}) as Record<string, unknown>;
        const salida =
          llamada.name === 'registrar_movimiento' ? await registrarMovimiento(args, turno)
          : llamada.name === 'consultar' ? await consultar(args, turno)
          : llamada.name === 'presupuesto' ? await presupuesto(args, turno)
          : `ERROR: no existe la herramienta "${llamada.name}".`;
        respuestas.push({ functionResponse: { name: llamada.name, response: { result: salida } } });
      }
      result = await conReintentos(() => chat.sendMessage(respuestas));
    }

    let salida = '';
    try {
      salida = result.response.text().trim();
    } catch {
      salida = '';
    }

    // Si dejó una pendiente pero no dijo nada útil, el resumen determinista
    // vale más que un silencio: el usuario tiene que poder confirmar.
    if (!salida) {
      salida = turno.pendienteId
        ? `${turno.resumen}\n¿Lo anoto?`
        : 'No entendí bien el mensaje. ¿Me lo repetís con el monto y en qué fue?';
    }

    return { texto: salida, dejoPendiente: turno.pendienteId !== null };
  } catch (err) {
    // La pendiente ya quedó guardada aunque el modelo haya fallado acá.
    throw traducirError(err);
  }
}
