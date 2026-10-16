/**
 * Lo de los estados de cuenta que habla con la base, contra un Supabase de
 * mentira.
 *
 * No hay red ni base: el cliente falso anota cada consulta que se le arma y
 * contesta lo que cada caso necesita. Alcanza para lo que importa acá, que es
 * lo que el SQL no puede probar: que se pagine hasta el final, que una base
 * sin la migración 0024 se lea como "todavía no" y no como un error, y que
 * cada código de la función llegue a la persona como su texto.
 *
 * Lo que hace la función SQL en sí se prueba en Postgres de verdad:
 * `npm run migraciones` (scripts/pg/estado-de-cuenta.prueba.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { crear } from './aserciones';
import { cargarContextoDeExtracto, deshacerImportacion, importarEstadoDeCuenta } from '@/lib/db';
import type { Db } from '@/lib/db';
import type { PedidoDeImportacion } from '@/lib/extractos/tipos';
import {
  ERRORES_DE_IMPORTACION, ERROR_DE_IMPORTACION_GENERICO, FALTA_MIGRACION,
} from '@/lib/extractos/textos';

const t = crear('extractos-db');

const YO = '00000000-0000-4000-8000-00000000000a';
const PAREJA = '00000000-0000-4000-8000-00000000000b';
const LIBRO = '20000000-0000-4000-8000-000000000001';
const COMPARTIDO = '20000000-0000-4000-8000-000000000002';
const CUENTA = '10000000-0000-4000-8000-000000000001';
const VISA = '10000000-0000-4000-8000-000000000002';
const IMPORTACION = '50000000-0000-4000-8000-000000000001';

// ─── El cliente falso ────────────────────────────────────────────────────────

type Llamada = [string, ...unknown[]];
interface Consulta { tabla: string; llamadas: Llamada[] }
interface Respuesta { data: unknown; error: unknown; count?: number | null }

/** El primer argumento de la primera llamada a `metodo`, o undefined. */
const arg = (c: Consulta, metodo: string, i = 0) => c.llamadas.find(l => l[0] === metodo)?.[i + 1];
const todas = (c: Consulta, metodo: string) => c.llamadas.filter(l => l[0] === metodo).map(l => l.slice(1));

/**
 * Un cliente que arma consultas encadenables como las de supabase-js y, al
 * esperarlas, contesta con `responder`. Todo lo que se le pidió queda anotado.
 */
function clienteFalso(
  responder: (c: Consulta) => Respuesta,
  rpc: (nombre: string, args: Record<string, unknown>) => Respuesta = () => ({ data: null, error: null }),
) {
  const consultas: Consulta[] = [];
  const llamadasRpc: { nombre: string; args: Record<string, unknown> }[] = [];

  function desde(tabla: string) {
    const consulta: Consulta = { tabla, llamadas: [] };
    consultas.push(consulta);
    const cadena: object = new Proxy({}, {
      get(_, prop) {
        // `await` busca `then`: recién ahí se contesta, como el builder real.
        if (prop === 'then') {
          return (bien: (r: Respuesta) => unknown, mal: (e: unknown) => unknown) =>
            Promise.resolve().then(() => responder(consulta)).then(bien, mal);
        }
        return (...args: unknown[]) => {
          consulta.llamadas.push([String(prop), ...args]);
          return cadena;
        };
      },
    });
    return cadena;
  }

  const supabase = {
    from: desde,
    rpc: (nombre: string, args: Record<string, unknown>) => {
      llamadasRpc.push({ nombre, args });
      return Promise.resolve(rpc(nombre, args));
    },
  };
  const db: Db = { supabase: supabase as unknown as SupabaseClient, userId: YO };
  return { db, consultas, llamadasRpc, de: (tabla: string) => consultas.filter(c => c.tabla === tabla) };
}

const vacia: Respuesta = { data: [], error: null };
const sinTabla = (tabla: string): Respuesta => ({
  data: null,
  error: { code: 'PGRST205', message: `Could not find the table 'public.${tabla}' in the schema cache` },
});

// ─── Una base con de todo ────────────────────────────────────────────────────

/** Una fila de movimiento inventada. Las impares son de la pareja, en la cuenta compartida. */
function movimiento(n: number) {
  const mio = n % 2 === 0;
  return {
    id: `tx-${n}`, user_id: mio ? YO : PAREJA, ledger_id: mio ? LIBRO : COMPARTIDO,
    type: 'expense', scope: 'personal', amount: n === 1 ? 1.15 : 19.99,
    category: 'Transporte', subcategory: null, description: `Movimiento ${n}`,
    date: '2026-09-03', source: n === 2 ? 'ai' : 'manual', card_id: null, created_at: '2026-09-03T12:00:00Z',
  };
}

/** Las páginas que contesta `transactions`: 1000, 1000 y 3. */
const PAGINAS_DE_MOVIMIENTOS = [1000, 1000, 3];

function base(cambios: Partial<Record<string, (c: Consulta) => Respuesta>> = {}) {
  return (c: Consulta): Respuesta => {
    const propia = cambios[c.tabla];
    if (propia) return propia(c);
    switch (c.tabla) {
      case 'ledger_members':
        // `misCuentas` pide la lista; `getLedgerRole`, el rol en una.
        return arg(c, 'select') === 'role'
          ? { data: { role: 'owner' }, error: null }
          : { data: [{ ledger_id: LIBRO }, { ledger_id: COMPARTIDO }], error: null };
      case 'transactions': {
        const [desdeFila] = (todas(c, 'range')[0] ?? [0]) as number[];
        const pagina = desdeFila / 1000;
        const cuantas = PAGINAS_DE_MOVIMIENTOS[pagina] ?? 0;
        return { data: Array.from({ length: cuantas }, (_, i) => movimiento(desdeFila + i)), error: null };
      }
      case 'shopping_trips':
        return { data: [{ id: 'compra-1', transaction_id: 'tx-6' }], error: null };
      case 'profiles':
        return { data: [{ id: YO, preferred_name: 'Ana' }, { id: PAREJA, display_name: 'Beto' }], error: null };
      case 'card_payments':
        return {
          data: [{ id: 'pago-1', card_id: VISA, source_card_id: null, amount: 500, date: '2026-09-05' }],
          error: null,
        };
      case 'statement_lines':
        if (String(arg(c, 'select')).includes('transactions(')) {
          return {
            data: [
              { match_key: 'shell', decision: 'expense', created_at: '2026-08-02T00:00:00Z',
                transactions: { type: 'expense', category: 'Transporte', subcategory: 'Combustible', ledger_id: LIBRO } },
              // PostgREST a veces devuelve la relación como lista de uno.
              { match_key: 'de:9876', decision: 'income', created_at: '2026-08-02T00:00:00Z',
                transactions: [{ type: 'income', category: 'Otros ingreso personal', subcategory: null, ledger_id: LIBRO }] },
              // Una omitida, o una cuyo movimiento se borró.
              { match_key: 'ret', decision: 'skipped', created_at: '2026-08-02T00:00:00Z', transactions: null },
            ],
            error: null,
          };
        }
        return {
          data: [{
            id: 'l-1', line_key: '2026-08-30|-4000|836000|0', bank: 'popular', account_last4: '3456',
            decision: 'linked', kind: 'purchase', match_key: 'metro', transaction_id: 'tx-4',
            card_payment_id: null, created_by_import: false, import_id: IMPORTACION,
            date: '2026-08-30', created_at: '2026-09-01T00:00:00Z',
          }],
          error: null,
        };
      case 'cards':
        return {
          data: [{ id: CUENTA, name: 'Ahorro prueba', kind: 'savings', last4: '3456', archived: true }],
          error: null,
        };
      case 'user_settings':
        return { data: { currency: 'DOP', locale: 'es-DO', timezone: 'America/Santo_Domingo' }, error: null };
      default:
        return vacia;
    }
  };
}

const CONSULTA = { banco: 'popular', ultimos4: '3456', desde: '2026-09-01', hasta: '2026-09-30' };

/** El lote mínimo que cuadra: una compra de 40 sobre 1.000. */
function pedido(cambios: Partial<PedidoDeImportacion> = {}): PedidoDeImportacion {
  return {
    cab: {
      bank: 'popular', last4: '3456', account_card_id: CUENTA, ledger_id: LIBRO,
      opening_cents: 100000, closing_cents: 96000, line_count: 1,
    },
    lineas: [{
      posted: '2026-09-03', date: '2026-09-03', cents: -4000, balance: 96000, kind: 'purchase',
      decision: 'expense', match_key: 'metro', category: 'Transporte', description: 'Metro',
    }],
    ...cambios,
  };
}

const RESULTADO_SQL = {
  import_id: IMPORTACION, creados: 1, enlazados: 0, pagos: 0, omitidos: 0, ya_estaban: 0,
};

async function rechaza(promesa: Promise<unknown>): Promise<string | null> {
  try { await promesa; return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

export const listo = (async () => {
  // ── El contexto ───────────────────────────────────────────────────────────

  {
    const f = clienteFalso(base());
    const ctx = await cargarContextoDeExtracto(f.db, CONSULTA);

    t.igual('con la migración corrida, se puede importar', ctx.migracionLista, true);
    t.igual('pagina hasta la que viene corta: 1000 + 1000 + 3', ctx.movimientos.length, 2003);
    t.igual('pide de a mil, en orden',
      f.de('transactions').map(c => todas(c, 'range')[0]), [[0, 999], [1000, 1999], [2000, 2999]]);
    t.cierto('cada página va ordenada por algo único',
      f.de('transactions').every(c => todas(c, 'order').some(o => o[0] === 'id')));
    const mov = f.de('transactions')[0];
    t.igual('los movimientos, desde 60 días antes de la primera fecha', arg(mov, 'gte', 1), '2026-07-03');
    t.igual('y hasta 35 después de la última', arg(mov, 'lte', 1), '2026-11-04');
    t.igual('lo propio y lo de las cuentas compartidas', arg(mov, 'or'),
      `user_id.eq.${YO},ledger_id.in.(${LIBRO},${COMPARTIDO})`);

    t.igual('los montos pasan a centavos', ctx.movimientos[0].centavos, 1999);
    t.igual('sin el error de la coma flotante (1.15 × 100)', ctx.movimientos[1].centavos, 115);
    t.igual('quién lo anotó', [ctx.movimientos[0].author_name, ctx.movimientos[1].author_name], ['Ana', 'Beto']);
    t.igual('el autor es el id de quien lo cargó', ctx.movimientos[1].author_id, PAREJA);
    t.igual('el origen se conserva (el correo se coteja distinto)', ctx.movimientos[2].source, 'ai');
    t.igual('lo que salió de una compra del súper se marca',
      ctx.movimientos.filter(m => m.esCompraDelSuper).map(m => m.id), ['tx-6']);

    const pagos = f.de('card_payments')[0];
    t.igual('los pagos de tarjeta, de 10 días antes', arg(pagos, 'gte', 1), '2026-08-22');
    t.igual('a 10 días después', arg(pagos, 'lte', 1), '2026-10-10');
    t.igual('solo los propios', arg(pagos, 'eq', 1), YO);
    t.igual('el pago, en centavos', ctx.pagosDeTarjeta,
      [{ id: 'pago-1', card_id: VISA, source_card_id: null, centavos: 50000, date: '2026-09-05' }]);

    const [previas, aprendido] = f.de('statement_lines');
    t.igual('las líneas previas, de 45 días antes', arg(previas, 'gte', 1), '2026-07-18');
    t.igual('a 45 después', arg(previas, 'lte', 1), '2026-11-14');
    t.cierto('de todas las cuentas del banco, no solo esta',
      !todas(previas, 'eq').some(e => e[0] === 'account_last4' || e[0] === 'bank'));
    t.igual('la línea previa llega entera', ctx.lineasPrevias[0], {
      line_key: '2026-08-30|-4000|836000|0', bank: 'popular', account_last4: '3456', decision: 'linked',
      kind: 'purchase', match_key: 'metro', transaction_id: 'tx-4', card_payment_id: null,
      created_by_import: false, import_id: IMPORTACION, date: '2026-08-30', created_at: '2026-09-01T00:00:00Z',
    });
    t.igual('lo aprendido mira las últimas 500 con clave', [arg(aprendido, 'limit'), arg(aprendido, 'neq')],
      [500, 'match_key']);
    t.igual('con la categoría que su movimiento tiene hoy', ctx.aprendido.map(a => [a.match_key, a.category, a.subcategory]),
      [['shell', 'Transporte', 'Combustible'], ['de:9876', 'Otros ingreso personal', null], ['ret', null, null]]);
    t.igual('una omitida no enseña categoría', ctx.aprendido[2].type, null);

    t.cierto('las cuentas, archivadas incluidas',
      ctx.cards.length === 1 && ctx.cards[0].archived && !todas(f.de('cards')[0], 'eq').some(e => e[0] === 'archived'));
    t.igual('la moneda de la persona', ctx.moneda, 'DOP');
    t.igual('quién importa', ctx.yo, YO);
  }

  {
    // Sin 0024: se lee y se revisa, pero no se importa. Nada de tirar.
    const f = clienteFalso(base({ statement_lines: () => sinTabla('statement_lines') }));
    const ctx = await cargarContextoDeExtracto(f.db, CONSULTA);
    t.igual('sin la tabla de líneas, todavía no se puede importar', ctx.migracionLista, false);
    t.igual('y no hay previas ni aprendido', [ctx.lineasPrevias, ctx.aprendido], [[], []]);
    t.igual('pero lo demás se carga igual', ctx.movimientos.length, 2003);
  }

  {
    const f = clienteFalso(base({
      statement_lines: () => ({ data: null, error: { code: '42P01', message: 'relation "public.statement_lines" does not exist' } }),
      shopping_trips: () => sinTabla('shopping_trips'),
      card_payments: () => sinTabla('card_payments'),
    }));
    const ctx = await cargarContextoDeExtracto(f.db, CONSULTA);
    t.igual('el "no existe" de Postgres también cuenta como migración pendiente', ctx.migracionLista, false);
    t.cierto('sin las tablas del súper y de los pagos, vacías y sin tirar',
      ctx.pagosDeTarjeta.length === 0 && ctx.movimientos.every(m => !m.esCompraDelSuper));
  }

  {
    const f = clienteFalso(base({ transactions: () => ({ data: null, error: { code: '500', message: 'se cayó' } }) }));
    t.cierto('un error de verdad sí tira',
      (await rechaza(cargarContextoDeExtracto(f.db, CONSULTA)))?.includes('No se pudieron leer los movimientos') === true);
  }

  {
    const f = clienteFalso(base());
    t.igual('una consulta con las fechas al revés no llega a la base',
      await rechaza(cargarContextoDeExtracto(f.db, { ...CONSULTA, desde: '2026-10-01' })),
      'Las fechas del estado de cuenta son inválidas.');
    t.igual('ni una consulta', f.consultas.length, 0);
  }

  {
    // Si una página viniera siempre llena —un bucle—, se corta con error en
    // vez de cortar callado: callado es justo lo que el paginado evita.
    const f = clienteFalso(base({
      transactions: c => {
        const [desdeFila] = todas(c, 'range')[0] as number[];
        return { data: Array.from({ length: 1000 }, (_, i) => movimiento(desdeFila + i)), error: null };
      },
    }));
    t.cierto('una consulta que no termina se corta con error',
      (await rechaza(cargarContextoDeExtracto(f.db, CONSULTA))) !== null);
  }

  // ── Importar ──────────────────────────────────────────────────────────────

  {
    const f = clienteFalso(base(), () => ({ data: RESULTADO_SQL, error: null }));
    const conDeMas = pedido();
    (conDeMas.lineas[0] as unknown as Record<string, unknown>).card_id = VISA;
    const r = await importarEstadoDeCuenta(f.db, conDeMas);
    t.igual('importa y traduce el resultado', r, {
      ok: true,
      resultado: { importId: IMPORTACION, creados: 1, enlazados: 0, pagos: 0, omitidos: 0, yaEstaban: 0, cardId: CUENTA },
    });
    t.igual('una sola llamada a la función', f.llamadasRpc.map(l => l.nombre), ['importar_estado_de_cuenta']);
    const lineas = f.llamadasRpc[0].args.p_lineas as Record<string, unknown>[];
    t.cierto('a la función le llega el pedido limpio', !('card_id' in lineas[0]));
    t.igual('con la cabecera tal cual', (f.llamadasRpc[0].args.p_cab as Record<string, unknown>).account_card_id, CUENTA);
    t.igual('sin nada que preparar no consulta ninguna tabla', f.consultas.length, 0);
  }

  {
    const f = clienteFalso(base(), () => ({ data: null, error: null }));
    const r = await importarEstadoDeCuenta(f.db, pedido({ lineas: [] }));
    t.igual('un pedido inválido ni llega a la función', [r, f.llamadasRpc.length],
      [{ ok: false, error: 'El estado de cuenta no tiene movimientos para importar.' }, 0]);
  }

  for (const error of [
    { code: 'PGRST202', message: 'Could not find the function public.importar_estado_de_cuenta(p_cab, p_lineas) in the schema cache' },
    { code: '42883', message: 'function public.importar_estado_de_cuenta(jsonb, jsonb) does not exist' },
  ]) {
    const f = clienteFalso(base(), () => ({ data: null, error }));
    t.igual(`sin la función (${error.code}), falta la migración`, await importarEstadoDeCuenta(f.db, pedido()),
      { ok: false, error: FALTA_MIGRACION, faltaMigracion: true });
  }

  for (const codigo of ['NO_CUADRA', 'YA_ENLAZADO', 'CATEGORIA_INVALIDA', 'REINTENTAR'] as const) {
    const f = clienteFalso(base(), () => ({ data: null, error: { code: 'P0001', message: codigo } }));
    t.igual(`el código ${codigo} llega como su texto`, await importarEstadoDeCuenta(f.db, pedido()),
      { ok: false, error: ERRORES_DE_IMPORTACION[codigo] });
  }

  for (const error of [
    { code: '23505', message: 'duplicate key value violates unique constraint "statement_lines_una_vez"' },
    { code: 'P0001', message: 'toString' },
    { message: 'Failed to fetch' },
  ]) {
    const f = clienteFalso(base(), () => ({ data: null, error }));
    t.igual(`lo desconocido no se muestra crudo: ${error.message}`, await importarEstadoDeCuenta(f.db, pedido()),
      { ok: false, error: ERROR_DE_IMPORTACION_GENERICO });
  }

  // ── Lo que se prepara antes ───────────────────────────────────────────────

  const cuentaNueva = { name: 'Ahorro Popular', kind: 'savings' as const, last4: '3456', issuer: 'Banco Popular', color: 'teal' as const };
  const conCuentaNueva = () => pedido({
    cab: { ...pedido().cab, account_card_id: null },
    cuentaNueva,
  });

  {
    // El nombre ya está tomado por otra cosa: se prueba con los 4 al final.
    let altas = 0;
    const f = clienteFalso(base({
      cards: c => {
        if (c.llamadas[0][0] !== 'insert') return { data: [], error: null };
        altas++;
        return altas === 1
          ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "cards_user_id_name_key"' } }
          : { data: { id: 'cuenta-nueva', name: (arg(c, 'insert') as { name: string }).name, kind: 'savings', last4: '3456' }, error: null };
      },
    }), (_, args) => ({
      data: { ...RESULTADO_SQL, account: (args.p_cab as Record<string, unknown>).account_card_id }, error: null,
    }));
    const r = await importarEstadoDeCuenta(f.db, conCuentaNueva());
    t.igual('si el nombre choca, se crea con los 4 al final',
      f.de('cards').filter(c => c.llamadas[0][0] === 'insert').map(c => (arg(c, 'insert') as { name: string }).name),
      ['Ahorro Popular', 'Ahorro Popular ··3456']);
    t.igual('y la función recibe la cuenta recién creada',
      (f.llamadasRpc[0].args.p_cab as Record<string, unknown>).account_card_id, 'cuenta-nueva');
    t.igual('que es la que vuelve en el resultado', r.ok && r.resultado.cardId, 'cuenta-nueva');
    t.cierto('antes de crear, se comprobó que la migración está', f.consultas[0].tabla === 'statement_lines');
  }

  {
    // Un reintento: la importación anterior falló con la cuenta ya creada.
    const f = clienteFalso(base({
      cards: c => c.llamadas[0][0] === 'insert'
        ? { data: null, error: { code: '23505', message: 'duplicate key' } }
        : { data: [{ id: 'la-de-antes', name: 'Ahorro Popular', kind: 'savings', last4: '3456' }], error: null },
    }), () => ({ data: RESULTADO_SQL, error: null }));
    const r = await importarEstadoDeCuenta(f.db, conCuentaNueva());
    t.igual('si la que choca es esta misma cuenta, se usa esa', r.ok && r.resultado.cardId, 'la-de-antes');
    t.igual('sin crear otra', f.de('cards').filter(c => c.llamadas[0][0] === 'insert').length, 1);
  }

  {
    const f = clienteFalso(base({ statement_lines: () => sinTabla('statement_lines') }), () => ({ data: null, error: null }));
    const r = await importarEstadoDeCuenta(f.db, conCuentaNueva());
    t.igual('sin la migración no se crea la cuenta: avisa antes', r,
      { ok: false, error: FALTA_MIGRACION, faltaMigracion: true });
    t.igual('ni un alta suelta', [f.de('cards').length, f.llamadasRpc.length], [0, 0]);
  }

  {
    // La categoría ya existe: es un reintento, o la creó alguien de la cuenta.
    const f = clienteFalso(base({
      categories: () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }),
    }), () => ({ data: RESULTADO_SQL, error: null }));
    const r = await importarEstadoDeCuenta(f.db, pedido({
      categoriasNuevas: [{ ledger_id: LIBRO, name: 'Cargos bancarios', type: 'expense' }],
    }));
    t.cierto('una categoría que ya existe cuenta como creada', r.ok && f.llamadasRpc.length === 1);
  }

  {
    const f = clienteFalso(base({
      ledger_members: () => ({ data: null, error: null }),
    }), () => ({ data: RESULTADO_SQL, error: null }));
    const r = await importarEstadoDeCuenta(f.db, pedido({
      categoriasNuevas: [{ ledger_id: LIBRO, name: 'Cargos bancarios', type: 'expense' }],
    }));
    t.igual('sin acceso a la cuenta, no se importa', [r, f.llamadasRpc.length],
      [{ ok: false, error: 'No tenés acceso a esa cuenta.' }, 0]);
  }

  {
    let actualizada: unknown = null;
    const f = clienteFalso(base({
      cards: c => {
        if (c.llamadas[0][0] === 'update') {
          actualizada = arg(c, 'update');
          return { data: { id: CUENTA, name: 'Ahorro prueba', kind: 'savings', last4: '3456' }, error: null };
        }
        return { data: { id: CUENTA, name: 'Ahorro prueba', kind: 'savings', last4: '' }, error: null };
      },
    }), () => ({ data: RESULTADO_SQL, error: null }));
    const r = await importarEstadoDeCuenta(f.db, pedido({ completarLast4: { card_id: CUENTA, last4: '3456' } }));
    t.cierto('a la cuenta sin 4 se le completan', r.ok);
    t.igual('con los del estado', actualizada, { last4: '3456' });
  }

  {
    const f = clienteFalso(base({
      cards: () => ({ data: { id: CUENTA, name: 'Ahorro prueba', kind: 'savings', last4: '9999' }, error: null }),
    }), () => ({ data: RESULTADO_SQL, error: null }));
    const r = await importarEstadoDeCuenta(f.db, pedido({ completarLast4: { card_id: CUENTA, last4: '3456' } }));
    t.igual('a una cuenta con otros 4 no se le pisan', [r, f.llamadasRpc.length],
      [{ ok: false, error: ERRORES_DE_IMPORTACION.CUENTA_INVALIDA }, 0]);
  }

  // ── Deshacer ──────────────────────────────────────────────────────────────

  {
    const f = clienteFalso(base(), () => ({ data: { deshechas: 7 }, error: null }));
    t.igual('deshace y cuenta las líneas', await deshacerImportacion(f.db, IMPORTACION), { ok: true, deshechas: 7 });
    t.igual('con el id de la importación', f.llamadasRpc[0], { nombre: 'deshacer_importacion', args: { p_import: IMPORTACION } });
  }
  {
    const f = clienteFalso(base(), () => ({ data: null, error: null }));
    t.igual('un id que no es de una importación ni llega a la base', [await deshacerImportacion(f.db, 'ayer'), f.llamadasRpc.length],
      [{ ok: false, error: 'Esa importación no existe.' }, 0]);
  }
  {
    const f = clienteFalso(base(), () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    t.igual('deshacer sin la migración', await deshacerImportacion(f.db, IMPORTACION), { ok: false, error: FALTA_MIGRACION });
  }
  {
    const f = clienteFalso(base(), () => ({ data: null, error: { code: '40P01', message: 'deadlock detected' } }));
    t.igual('deshacer que falla no borró nada', await deshacerImportacion(f.db, IMPORTACION),
      { ok: false, error: 'No se pudo deshacer la importación. No se borró nada; probá de nuevo.' });
  }

  t.resumen();
})();
