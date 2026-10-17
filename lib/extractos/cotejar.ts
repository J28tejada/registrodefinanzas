/**
 * Qué líneas del banco ya estaban anotadas en la app.
 *
 * Es la defensa contra contar dos veces: una compra que se anotó por WhatsApp el
 * día que pasó y vuelve a aparecer en el estado de cuenta tiene que ENLAZARSE
 * con ese movimiento, no anotarse de nuevo.
 *
 * La regla de fondo es asimétrica a propósito. Enlazar de más esconde un gasto
 * real (dos compras iguales de 40 explicadas por un solo movimiento); enlazar de
 * menos solo deja una pregunta. Por eso lo automático ('exacto') es estrecho
 * —monto al centavo, ventana corta, uno a uno, solo lo que anotó la misma
 * persona— y todo lo demás se OFRECE ('posible') y nunca se asigna solo.
 *
 * Puro y determinista: el mismo estado y la misma base dan el mismo resultado,
 * vengan los candidatos en el orden que vengan. La web y el teléfono lo corren
 * igual y tienen que mostrar lo mismo.
 */
import { diasEntre, sumarDias } from '../tarjetas';
import type {
  ClaseDeLinea, ContextoDeExtracto, LineaDeExtracto, LineaPrevia, MovimientoCandidato, PagoCandidato,
} from './tipos';

// ─── El estado de cada línea frente a importaciones anteriores ───────────────

/**
 * - `nueva`: nunca pasó por una importación.
 * - `importada`: CERRADA. Lo que hizo sigue existiendo; no se vuelve a tocar.
 * - `sin-anotar-antes`: abierta porque la vez pasada quedó sin anotar.
 * - `borrada`: abierta porque lo que creó o enlazó se borró después.
 */
export type EstadoDeLinea = 'nueva' | 'importada' | 'sin-anotar-antes' | 'borrada';

/**
 * Las líneas previas de ESTA cuenta, por clave.
 *
 * Banco y últimos 4, igual que la restricción única de la tabla: la clave sola
 * (fecha|monto|saldo|n) podría repetirse en otra cuenta.
 */
export function previasDeLaCuenta(
  previas: LineaPrevia[], banco: string, ultimos4: string,
): Map<string, LineaPrevia> {
  const porClave = new Map<string, LineaPrevia>();
  for (const p of previas) {
    if (p.bank === banco && p.account_last4 === ultimos4) porClave.set(p.line_key, p);
  }
  return porClave;
}

/** El mismo criterio que `importar_estado_de_cuenta` usa para decidir si una línea está abierta. */
export function estadoDeLinea(previa: LineaPrevia | undefined | null): EstadoDeLinea {
  if (!previa) return 'nueva';
  if (previa.decision === 'skipped') return 'sin-anotar-antes';
  if (previa.decision === 'card_payment') return previa.card_payment_id ? 'importada' : 'borrada';
  return previa.transaction_id || previa.card_payment_id ? 'importada' : 'borrada';
}

/**
 * Los movimientos y pagos que ya explican alguna línea, de esta cuenta o de
 * otra. No se ofrecen más: la función SQL rechaza dos líneas sobre el mismo
 * movimiento (YA_ENLAZADO), y con razón.
 */
export function idsUsados(previas: LineaPrevia[]): Set<string> {
  const usados = new Set<string>();
  for (const p of previas) {
    if (p.transaction_id) usados.add(p.transaction_id);
    if (p.card_payment_id) usados.add(p.card_payment_id);
  }
  return usados;
}

// ─── Lo que devuelve ─────────────────────────────────────────────────────────

/**
 * Por qué se ofrece un candidato.
 * - `exacto`: mismo monto al centavo, en la ventana, anotado por quien importa.
 * - `pago`: un pago de tarjeta ya registrado por el mismo monto.
 * - `pareja`: monto exacto, pero lo anotó otra persona de la cuenta compartida.
 * - `correo`: monto exacto, salido del correo, pero con más de una pareja posible.
 * - `super`: una compra del súper, guardada con el total ESTIMADO del carrito.
 * - `comercio`: el mismo comercio cerca en la fecha, con otro monto.
 * - `manual`: lo eligió la persona de la lista completa.
 */
export type MotivoDeCandidato = 'exacto' | 'pago' | 'pareja' | 'correo' | 'super' | 'comercio' | 'manual';

export type Candidato =
  | { tipo: 'movimiento'; movimiento: MovimientoCandidato; motivo: MotivoDeCandidato }
  | { tipo: 'pago'; pago: PagoCandidato; motivo: MotivoDeCandidato };

/** Cómo se nombra un candidato sin cargar el objeto entero. */
export interface RefDeCandidato {
  tipo: 'movimiento' | 'pago';
  id: string;
}

/**
 * - `exacto`: se enlaza solo ("Ya estaba anotado"), salvo que la persona diga "Es otro".
 * - `posible`: hasta 3 candidatos que se preguntan ("¿Ya lo anotaste?"). Nunca se asignan solos.
 * - `ninguno`: no hay nada parecido, o la línea no se coteja (cerrada, retiro, entre cuentas).
 */
export type Cotejo =
  | { tipo: 'exacto'; candidato: Candidato }
  | { tipo: 'posible'; candidatos: Candidato[] }
  | { tipo: 'ninguno' };

export interface OpcionesDeCotejo {
  banco: string;
  ultimos4: string;
  /** La cuenta del banco en la Billetera, si ya se sabe: desempata y filtra los pagos. */
  cuentaId: string | null;
}

export function idDeCandidato(c: Candidato): string {
  return c.tipo === 'movimiento' ? c.movimiento.id : c.pago.id;
}

export function refDeCandidato(c: Candidato): RefDeCandidato {
  return { tipo: c.tipo, id: idDeCandidato(c) };
}

/** Una clave que no choca entre un movimiento y un pago con el mismo uuid. */
export function llaveDeCandidato(c: Candidato | RefDeCandidato): string {
  return 'id' in c ? `${c.tipo}:${c.id}` : `${c.tipo}:${idDeCandidato(c)}`;
}

export function centavosDeCandidato(c: Candidato): number {
  return Math.abs(c.tipo === 'movimiento' ? c.movimiento.centavos : c.pago.centavos);
}

export function fechaDeCandidato(c: Candidato): string {
  return (c.tipo === 'movimiento' ? c.movimiento.date : c.pago.date).slice(0, 10);
}

// ─── Comparar textos ─────────────────────────────────────────────────────────

/** Minúsculas, sin tildes y solo letras y números separados por un espacio. */
export function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Palabras que no distinguen a un comercio: con 'super' como pista, todo
 * supermercado se parecería a todo otro.
 */
const PALABRAS_VACIAS = new Set([
  'la', 'el', 'los', 'las', 'de', 'del', 'y', 'the', 'and', 'en',
  'super', 'supermercado', 'supermercados', 'farmacia', 'farmacias', 'tienda', 'tiendas',
  'restaurante', 'restaurant', 'colmado', 'bar', 'sa', 'srl', 'inc', 'com', 'www',
]);

/**
 * La palabra que identifica al comercio de una línea, o null.
 *
 * Sale del `matchKey` ('pedidosya', 'super nacional' → 'nacional'). Una
 * transferencia ('a:1234') o un depósito ('dep:acte') no tienen comercio: su
 * contraparte no aparece escrita en lo que la persona anota.
 */
export function tokenDeComercio(matchKey: string): string | null {
  if (!matchKey || matchKey.includes(':')) return null;
  const palabras = normalizarTexto(matchKey).split(' ').filter(p => /[a-z]/.test(p));
  const buena = palabras.find(p => p.length >= 3 && !PALABRAS_VACIAS.has(p));
  return buena ?? null;
}

const palabrasCache = new WeakMap<object, string[]>();

/**
 * Si un texto nombra al comercio.
 *
 * Desde el principio de alguna palabra, saltando los espacios: así
 * 'pedidosya' encuentra "Pedidos Ya" y 'uber' encuentra "Uber Eats", pero
 * 'uber' no encuentra "tubería".
 */
export function mencionaComercio(texto: string, token: string, cacheDe?: object): boolean {
  let palabras = cacheDe ? palabrasCache.get(cacheDe) : undefined;
  if (!palabras) {
    palabras = normalizarTexto(texto).split(' ').filter(Boolean);
    if (cacheDe) palabrasCache.set(cacheDe, palabras);
  }
  for (let k = 0; k < palabras.length; k++) {
    if (!token.startsWith(palabras[k].slice(0, 1))) continue;
    if (palabras.slice(k).join('').startsWith(token)) return true;
  }
  return false;
}

// ─── El algoritmo ────────────────────────────────────────────────────────────

/** Las clases que nunca se cotejan contra movimientos: no gastan candidatos que una compra necesita. */
const SIN_COTEJO: ClaseDeLinea[] = ['withdrawal', 'own_transfer'];

/** Las que pueden ser un pago de tarjeta ya registrado. */
const PUEDEN_SER_PAGO: ClaseDeLinea[] = ['transfer_out', 'own_transfer'];

/**
 * La ventana en la que un movimiento anotado puede ser esta línea.
 *
 * Lo del correo se fecha el día del escaneo, que puede ser semanas después: por
 * eso su ventana se estira hacia adelante. El resto se anota cerca del día, y la
 * fecha de la compra y la del banco difieren en unos pocos días.
 */
function enVentana(l: LineaDeExtracto, t: MovimientoCandidato): boolean {
  const correo = t.source === 'ai';
  const desde = sumarDias(l.fecha, correo ? -1 : -3);
  const hasta = sumarDias(l.asentada, correo ? 35 : 3);
  const d = t.date.slice(0, 10);
  return d >= desde && d <= hasta;
}

/** Un débito solo puede ser un gasto anotado; un crédito, un ingreso. */
function signoOk(l: LineaDeExtracto, t: MovimientoCandidato): boolean {
  return (l.centavos < 0) === (t.type === 'expense');
}

function distancia(a: string, b: string): number {
  return Math.abs(diasEntre(a, b.slice(0, 10)));
}

function porTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface Arista {
  i: number;
  t: MovimientoCandidato;
}

/**
 * Coteja cada línea del estado contra lo ya anotado. Devuelve un `Cotejo` por
 * CADA línea (las que no se cotejan, como 'ninguno').
 *
 * 1. Exactos: mismo signo, misma plata al centavo, dentro de la ventana. Lo de
 *    otra persona va a 'posible' (nunca se enlaza solo lo que no anotaste vos).
 *    Lo del correo solo es exacto si es el ÚNICO candidato de la línea y la
 *    línea es la ÚNICA con ese monto en su ventana. El resto se reparte uno a
 *    uno, de lo más cercano en fecha a lo más lejano.
 * 2. Pagos de tarjeta: una transferencia contra un pago ya registrado.
 * 3. Cercanos: se ofrecen, no se asignan.
 */
export function cotejar(
  lineas: LineaDeExtracto[], ctx: ContextoDeExtracto, op: OpcionesDeCotejo,
): Map<string, Cotejo> {
  const previas = previasDeLaCuenta(ctx.lineasPrevias, op.banco, op.ultimos4);
  const usados = idsUsados(ctx.lineasPrevias);
  // Ordenados por id: así el resultado no depende del orden en que llegaron.
  const cand = ctx.movimientos.filter(t => !usados.has(t.id)).sort((a, b) => porTexto(a.id, b.id));
  const pagos = ctx.pagosDeTarjeta.filter(p => !usados.has(p.id)).sort((a, b) => porTexto(a.id, b.id));

  const abierta = lineas.map(l => estadoDeLinea(previas.get(l.clave)) !== 'importada');
  const elegible = lineas.map((l, i) => abierta[i] && !SIN_COTEJO.includes(l.clase));

  const resultado = new Map<string, Cotejo>();
  const asignado = new Map<number, Candidato>();
  const tomados = new Set<string>();
  const demorados = new Map<number, Candidato[]>();
  const demorar = (i: number, c: Candidato) => {
    const lista = demorados.get(i) ?? [];
    lista.push(c);
    demorados.set(i, lista);
  };

  // ── 1) Exactos ──
  const exactas: Arista[] = [];
  const porLinea = new Map<number, MovimientoCandidato[]>();
  lineas.forEach((l, i) => {
    if (!elegible[i]) return;
    const monto = Math.abs(l.centavos);
    const delMonto = cand.filter(t => signoOk(l, t) && enVentana(l, t) && Math.abs(t.centavos) === monto);
    porLinea.set(i, delMonto);
  });

  for (const [i, delMonto] of porLinea) {
    const l = lineas[i];
    for (const t of delMonto) {
      if (t.author_id !== ctx.yo) {
        demorar(i, { tipo: 'movimiento', movimiento: t, motivo: 'pareja' });
        continue;
      }
      if (t.source === 'ai') {
        const unicoCandidato = delMonto.length === 1;
        // Cuántas líneas abiertas, con ese monto y signo, tienen a este movimiento en su ventana.
        let lineasConEseMonto = 0;
        lineas.forEach((o, j) => {
          if (elegible[j] && Math.abs(o.centavos) === Math.abs(l.centavos) && signoOk(o, t) && enVentana(o, t)) {
            lineasConEseMonto++;
          }
        });
        if (!unicoCandidato || lineasConEseMonto !== 1) {
          demorar(i, { tipo: 'movimiento', movimiento: t, motivo: 'correo' });
          continue;
        }
      }
      exactas.push({ i, t });
    }
  }

  exactas.sort((a, b) => {
    const la = lineas[a.i];
    const lb = lineas[b.i];
    return (
      distancia(la.fecha, a.t.date) - distancia(lb.fecha, b.t.date) ||
      distancia(la.asentada, a.t.date) - distancia(lb.asentada, b.t.date) ||
      (a.t.card_id === op.cuentaId ? 0 : 1) - (b.t.card_id === op.cuentaId ? 0 : 1) ||
      porTexto(a.t.id, b.t.id) ||
      a.i - b.i
    );
  });
  for (const { i, t } of exactas) {
    if (asignado.has(i) || tomados.has(`movimiento:${t.id}`)) continue;
    asignado.set(i, { tipo: 'movimiento', movimiento: t, motivo: 'exacto' });
    tomados.add(`movimiento:${t.id}`);
  }

  // ── 2) Pagos de tarjeta ──
  const ultimos4DeTarjeta = new Map(ctx.cards.map(c => [c.id, c.last4] as [string, string]));
  const aristasDePago: { i: number; p: PagoCandidato }[] = [];
  lineas.forEach((l, i) => {
    if (!abierta[i] || asignado.has(i) || l.centavos >= 0 || !PUEDEN_SER_PAGO.includes(l.clase)) return;
    const desde = sumarDias(l.fecha, -3);
    const hasta = sumarDias(l.asentada, 5);
    for (const p of pagos) {
      const d = p.date.slice(0, 10);
      if (Math.abs(p.centavos) !== -l.centavos || d < desde || d > hasta) continue;
      if (p.source_card_id !== null && p.source_card_id !== op.cuentaId) continue;
      // Si el banco dice a qué tarjeta fue y la app sabe la de este pago, tienen que coincidir.
      const l4 = ultimos4DeTarjeta.get(p.card_id);
      if (l.ultimos4Contraparte && l4 && l4 !== l.ultimos4Contraparte) continue;
      aristasDePago.push({ i, p });
    }
  });
  aristasDePago.sort((a, b) => {
    const la = lineas[a.i];
    const lb = lineas[b.i];
    return (
      distancia(la.fecha, a.p.date) - distancia(lb.fecha, b.p.date) ||
      distancia(la.asentada, a.p.date) - distancia(lb.asentada, b.p.date) ||
      porTexto(a.p.id, b.p.id) ||
      a.i - b.i
    );
  });
  for (const { i, p } of aristasDePago) {
    if (asignado.has(i) || tomados.has(`pago:${p.id}`)) continue;
    asignado.set(i, { tipo: 'pago', pago: p, motivo: 'pago' });
    tomados.add(`pago:${p.id}`);
  }

  // ── 3) Cercanos: se ofrecen, nunca se asignan ──
  lineas.forEach((l, i) => {
    const exacto = asignado.get(i);
    if (exacto) {
      resultado.set(l.clave, { tipo: 'exacto', candidato: exacto });
      return;
    }
    if (!elegible[i]) {
      resultado.set(l.clave, { tipo: 'ninguno' });
      return;
    }
    const monto = Math.abs(l.centavos);
    const token = tokenDeComercio(l.matchKey);
    const vistos = new Set<string>();
    const lista: Candidato[] = [];
    for (const c of demorados.get(i) ?? []) {
      const id = idDeCandidato(c);
      if (vistos.has(id) || tomados.has(`movimiento:${id}`)) continue;
      vistos.add(id);
      lista.push(c);
    }
    const tolerancia = Math.max(2000, Math.round(monto / 10));
    for (const t of cand) {
      if (vistos.has(t.id) || tomados.has(`movimiento:${t.id}`) || !signoOk(l, t)) continue;
      const dias = distancia(l.fecha, t.date);
      // El súper se guarda con lo que estimaba el carrito, no con lo cobrado.
      if (t.esCompraDelSuper && dias <= 1 && Math.abs(Math.abs(t.centavos) - monto) <= tolerancia) {
        vistos.add(t.id);
        lista.push({ tipo: 'movimiento', movimiento: t, motivo: 'super' });
        continue;
      }
      // Un cobro en dólares anotado como '20' cuando el banco cobró 1,190 pesos.
      if (token && dias <= 3 && mencionaComercio(t.description, token, t)) {
        vistos.add(t.id);
        lista.push({ tipo: 'movimiento', movimiento: t, motivo: 'comercio' });
      }
    }
    if (lista.length === 0) {
      resultado.set(l.clave, { tipo: 'ninguno' });
      return;
    }
    lista.sort((a, b) =>
      Math.abs(centavosDeCandidato(a) - monto) - Math.abs(centavosDeCandidato(b) - monto) ||
      distancia(l.fecha, fechaDeCandidato(a)) - distancia(l.fecha, fechaDeCandidato(b)) ||
      porTexto(idDeCandidato(a), idDeCandidato(b)));
    resultado.set(l.clave, { tipo: 'posible', candidatos: lista.slice(0, 3) });
  });

  return resultado;
}
