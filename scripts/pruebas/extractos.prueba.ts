/**
 * El lector de estados de cuenta, sin PDF: de los fragmentos al estado leído.
 *
 * Todo con datos INVENTADOS (`sinteticos/estado.ts`): el repo es público y un
 * estado de cuenta real tiene nombre, número de cuenta y saldos. Lo que sí se
 * copió del real es dónde cae cada cosa en la página, que es de lo que depende
 * el lector.
 */
import { crear } from './aserciones';
import { aCentavos } from '@/lib/extractos/montos';
import { esFechaISO, fechaCorta, fechaLarga } from '@/lib/extractos/fechas';
import { agruparRenglones, textoDe } from '@/lib/extractos/renglones';
import { detectarFormato } from '@/lib/extractos/formatos';
import { popularCuenta } from '@/lib/extractos/formatos/popular-cuenta';
import { conciliar } from '@/lib/extractos/conciliar';
import { clasificar, esDelTitular } from '@/lib/extractos/clasificar';
import {
  claveDeComercio, enmascarar, limpiarComercio, nombreCorto, sanear, sinTitular,
} from '@/lib/extractos/sanear';
import { claveDeLinea, clavesDelEstado } from '@/lib/extractos/claves';
import { interpretar } from '@/lib/extractos/interpretar';
import { base64ABytes, bytesABase64 } from '@/lib/extractos/base64';
import type { FragmentoPdf, LecturaCruda, LineaCruda } from '@/lib/extractos/tipos';
import {
  armarEstado, CUENTA, ESPERADO, IBAN, LINEAS, SALDO_ANTERIOR, TITULAR, type OpcionesDelEstado,
} from './sinteticos/estado';

const t = crear('extractos');

// ── Montos ───────────────────────────────────────────────────────────────────

t.igual('miles con coma', aCentavos('1,234.56'), 123456);
t.igual('débito chico', aCentavos('-0.20'), -20);
t.igual('millones', aCentavos('12,345,678.90'), 1234567890);
t.igual('cero no es menos cero', Object.is(aCentavos('-0.00'), 0), true);
t.igual('con espacios alrededor', aCentavos(' 5.00 '), 500);
for (const malo of ['12.5', '1.234,56', '1,23.45', '1234.56', '.99', '-', '1,234', 'RD$ 5.00', '']) {
  t.igual(`no es un monto del banco: "${malo}"`, aCentavos(malo), null);
}

// ── Fechas ───────────────────────────────────────────────────────────────────

t.igual('español', fechaCorta('25AGO', '2026-09-22'), '2026-08-25');
t.igual('inglés, el mismo mes', fechaCorta('24AUG', '2026-09-22'), '2026-08-24');
t.igual('ENE', fechaCorta('02ENE', '2027-01-06'), '2027-01-02');
t.igual('JAN', fechaCorta('02JAN', '2027-01-06'), '2027-01-02');
t.igual('diciembre con corte en enero es del año anterior', fechaCorta('28DIC', '2027-01-06'), '2026-12-28');
t.igual('DEC también', fechaCorta('28DEC', '2027-01-06'), '2026-12-28');
t.igual('el mismo mes del corte es del mismo año', fechaCorta('22SEP', '2026-09-22'), '2026-09-22');
t.igual('un día que no existe no se corre', fechaCorta('31SEP', '2026-09-30'), null);
t.igual('29 de febrero bisiesto', fechaCorta('29FEB', '2028-03-05'), '2028-02-29');
t.igual('29 de febrero no bisiesto', fechaCorta('29FEB', '2027-03-05'), null);
t.igual('mes inventado', fechaCorta('10XYZ', '2026-09-22'), null);
t.igual('fecha larga', fechaLarga('22 de septiembre de 2026'), '2026-09-22');
t.igual('fecha larga de un dígito', fechaLarga('6 de enero de 2027'), '2027-01-06');
t.igual('fecha larga en mayúsculas', fechaLarga('6 DE ENERO DE 2027'), '2027-01-06');
t.igual('fecha larga imposible', fechaLarga('31 de febrero de 2026'), null);
t.igual('sin fecha', fechaLarga('Pag 1'), null);
t.cierto('ISO válida', esFechaISO('2026-02-28') && !esFechaISO('2026-02-30') && !esFechaISO('2026-2-3'));

// ── Renglones ────────────────────────────────────────────────────────────────

const frag = (s: string, x: number, y: number, pagina = 1): FragmentoPdf => ({ s, x, y, fin: x + 10, pagina });
{
  const r = agruparRenglones([
    frag('CORTE', 123.1, 179.3, 2), frag('99.00', 544.6, 178.7, 2),
    frag('abajo', 10, 100), frag('B', 50, 700), frag('A', 10, 700.4), frag('  ', 30, 700),
    frag('22SEP', 42.9, 179.3, 2),
  ]);
  t.igual('de arriba hacia abajo, página por página, izquierda a derecha',
    r.map(textoDe), ['A B', 'abajo', '22SEP CORTE 99.00']);
  t.igual('0.6 pt de diferencia es el mismo renglón', r[2].fragmentos.length, 3);
  t.igual('1.6 pt ya no', agruparRenglones([frag('a', 0, 100), frag('b', 5, 98.4)]).length, 2);
}

// ── El lector del Popular, sobre el estado sintético ─────────────────────────

function leerSintetico(op: OpcionesDelEstado = {}): LecturaCruda {
  const r = popularCuenta.leer(agruparRenglones(armarEstado(op).fragmentos));
  if ('error' in r) throw new Error(`el estado sintético no se leyó: ${r.error}`);
  return r;
}

const estado = armarEstado();
const renglones = agruparRenglones(estado.fragmentos);
t.cierto('lo reconoce', popularCuenta.reconoce(renglones));
t.igual('y es el único formato que lo reconoce', detectarFormato(renglones)?.id, 'popular-cuenta');
t.igual('un PDF cualquiera no es un estado',
  detectarFormato(agruparRenglones([frag('Factura', 50, 700), frag('Total 1,000.00', 50, 680)])), null);
t.cierto('sin el banco no lo reconoce, aunque tenga la tabla', !popularCuenta.reconoce(
  agruparRenglones(estado.fragmentos.filter(f => !/BPDO|POPULAR/.test(f.s)))));

const cruda = leerSintetico();
t.igual('encabezado', [cruda.producto, cruda.tipoDeCuenta, cruda.moneda, cruda.ultimos4, cruda.corte],
  ['CUENTA DIGITAL LIBRE', 'savings', 'DOP', '3456', '2027-01-06']);
t.igual('el titular, que solo vive en el servidor', cruda.titular, TITULAR);
t.igual('saldo anterior de la tabla (con el mes en inglés)', cruda.saldoInicialCentavos, SALDO_ANTERIOR);
t.igual('saldo al corte de la tabla', cruda.saldoFinalCentavos, estado.saldoFinal);
t.igual('resumen', [cruda.resumen.creditos.n, cruda.resumen.debitos.n, cruda.resumen.saldoAlCorteCentavos],
  [ESPERADO.creditos, ESPERADO.debitos, estado.saldoFinal]);
t.igual('todas las líneas, de las dos páginas, y ni un número del gráfico', cruda.lineas.length, ESPERADO.lineas);
t.igual('los montos con su signo', cruda.lineas.map(l => l.centavos), LINEAS.map(l => l.centavos));
t.igual('el primer renglón en dos pedazos y el de abajo entero', cruda.lineas[1].detalle,
  ['SUPER EJEMPLO - CENTRO', 'SDO, 111122223333 444555 POS W/D 1', '87654321']);
t.igual('las fechas con el año del corte', [cruda.lineas[1].asentada, cruda.lineas[1].fecha],
  ['2026-12-09', '2026-12-08']);
t.igual('y las de enero, del año del corte', [cruda.lineas[15].asentada, cruda.lineas[15].fecha],
  ['2027-01-02', '2026-12-31']);
t.igual('la primera de la página 2', [cruda.lineas[10].pagina, cruda.lineas[10].detalle],
  [2, ['MB desde 009876543 MARIA RODRIGUEZ L']]);
t.cierto('una línea de un solo renglón no se lleva el de abajo',
  cruda.lineas[3].detalle.length === 1 && cruda.lineas[3].detalle[0] === 'CARGO MENSUAL TD CLASICA');
{
  // El gráfico tiene un monto justo en el borde de los créditos: igual no es un movimiento.
  const grafico = estado.fragmentos.find(f => f.s === '25,000.00');
  t.cierto('el gráfico tiene un número alineado con los créditos', !!grafico && Math.abs(grafico.fin - 514.5) < 0.01);
}
t.igual('sin el título de la tabla no se lee', popularCuenta.leer(agruparRenglones(
  estado.fragmentos.filter(f => !f.s.startsWith('DÉBITO')))), { error: 'FORMATO_DESCONOCIDO' });
t.igual('sin la fecha de corte no hay año', popularCuenta.leer(agruparRenglones(
  estado.fragmentos.filter(f => !/de enero de/.test(f.s)))), { error: 'FORMATO_DESCONOCIDO' });

// ── Cuadrar ──────────────────────────────────────────────────────────────────

t.igual('el sintético cuadra', conciliar(cruda), { ok: true });
t.igual('una línea que el lector se comió corta la cadena en la siguiente',
  conciliar(leerSintetico({ omitir: [3] })), { ok: false, motivo: 'saldo', fecha: '2026-12-12' });
{
  // Un débito impreso sin el menos: el lector no adivina y deja la línea en 0.
  const lineas = LINEAS.map((l, i) => (i === 3 ? { ...l, impreso: { texto: '75.00', columna: 'debito' as const } } : l));
  t.igual('un débito sin menos', conciliar(leerSintetico({ lineas })), { ok: false, motivo: 'signo', fecha: '2026-12-10' });
  const lineas2 = LINEAS.map((l, i) => (i === 0 ? { ...l, impreso: { texto: '-5,000.00', columna: 'credito' as const } } : l));
  t.igual('un crédito con menos', conciliar(leerSintetico({ lineas: lineas2 })), { ok: false, motivo: 'signo', fecha: '2026-12-08' });
}
{
  const base = armarEstado();
  const sCred = LINEAS.filter(l => l.centavos > 0).reduce((s, l) => s + l.centavos, 0);
  t.igual('+1 centavo en los totales', conciliar(leerSintetico({ resumen: { creditos: sCred + 1 } })),
    { ok: false, motivo: 'totales' });
  t.igual('un débito de más en el conteo', conciliar(leerSintetico({ resumen: { nDebitos: base.debitos + 1 } })),
    { ok: false, motivo: 'conteo' });
  t.igual('el saldo anterior del resumen no es el de la tabla',
    conciliar(leerSintetico({ resumen: { anterior: SALDO_ANTERIOR + 100 } })), { ok: false, motivo: 'apertura' });
  t.igual('el saldo al corte del resumen no es el de la tabla',
    conciliar(leerSintetico({ resumen: { corte: base.saldoFinal - 1 } })), { ok: false, motivo: 'cierre' });
}
{
  const conLinea = (i: number, cambio: Partial<LineaCruda>): LecturaCruda =>
    ({ ...cruda, lineas: cruda.lineas.map((l, k) => (k === i ? { ...l, ...cambio } : l)) });
  t.igual('una fecha de entrada que vuelve para atrás', conciliar(conLinea(4, { asentada: '2026-12-09' })),
    { ok: false, motivo: 'fechas', fecha: '2026-12-09' });
  t.igual('una transacción después de asentarse', conciliar(conLinea(4, { fecha: '2026-12-13' })),
    { ok: false, motivo: 'fechas', fecha: '2026-12-12' });
  t.igual('una transacción de más de un mes antes', conciliar(conLinea(4, { fecha: '2026-11-10' })),
    { ok: false, motivo: 'fechas', fecha: '2026-12-12' });
  t.igual('una transacción 5 días antes, en el mes anterior, está bien',
    conciliar(conLinea(0, { asentada: '2026-12-02', fecha: '2026-11-27' })), { ok: true });
  t.igual('una línea después del corte',
    conciliar({ ...cruda, corte: '2027-01-05' }), { ok: false, motivo: 'fechas', fecha: '2027-01-06' });
  t.igual('un saldo que no se pudo leer', conciliar(conLinea(2, { saldoCentavos: Number.NaN })),
    { ok: false, motivo: 'saldo', fecha: '2026-12-10' });
  t.igual('si no cuadra no sale ninguna línea', interpretar(conLinea(2, { saldoCentavos: 1 })),
    { ok: false, codigo: 'NO_CUADRA', motivo: 'saldo', fecha: '2026-12-10' });
}

// ── Clasificar ───────────────────────────────────────────────────────────────

const clase = (detalle: string[], centavos: number) => clasificar(detalle, centavos, TITULAR).clase;
t.igual('POS W/D', clase(['SHELL - CENTRO', 'SDO, 1234 POS W/D 1'], -100), 'purchase');
t.igual("'PO' y 'W/D' en renglones distintos", clase(['GASOLINERA', 'SDO, 1234 PO', 'W/D 12 8765'], -100), 'purchase');
t.igual("'OS W/D' sin la P", clase(['TIENDA', '123456 OS W/D 12 8765'], -100), 'purchase');
t.igual("'OS CR RTN' que suma es una devolución", clase(['TIENDA', '123456 OS CR RTN 8765'], 100), 'refund');
t.igual("'OS CR RTN' que resta no se adivina", clase(['TIENDA', '123456 OS CR RTN 8765'], -100), 'other');
for (const ret of ['RET DE C K ATM1', '1234 RET CHK ATM1', '1234 RET E CHK ATM1', '1234 RET DE CHK ATM1']) {
  t.igual(`retiro: ${ret}`, clase(['CAJERO, 1234', ret], -100), 'withdrawal');
}
t.igual('DEP ACTE', clase(['CAJERO, 1234', '1234 DEP ACTE ATM1'], 100), 'deposit');
t.igual('DEP CTAC', clase(['SUCURSAL, 1234', 'DEP CTAC E ATM1'], 100), 'deposit');
t.igual('un depósito que resta no es depósito', clase(['1234 DEP ACTE'], -100), 'other');
t.igual('impuesto DGII', clase(['PAGO IMPUESTO 0.15% DGII, 3 TRANS POR $ 7,000.00 Del'], -105), 'fee');
t.igual('cargo mensual', clase(['CARGO MENSUAL TD CLASICA'], -7500), 'fee');
t.igual('una transferencia a la DGII no es un cargo del banco', clase(['Pago ACH DGII a 0001112223'], -100), 'transfer_out');
t.igual('seguro del banco', clase(['BANCASEGURO DIC 2026 RD$', '.00'], -4500), 'fee');
t.igual('comisión', clase(['COMISION POR TRANSFERENCIA'], -100), 'fee');
t.igual('intereses ganados', clase(['INTERESES GANADOS'], 100), 'interest');
t.igual('MB a', clase(['MB a 0001234567 PEDRO PEREZ'], -100), 'transfer_out');
t.igual('MB desde', clase(['MB desde 009876543 MARIA RODRIGUEZ L'], 100), 'transfer_in');
t.igual('Pago ACH', clase(['Pago ACH BANCO a 0007654321'], -100), 'transfer_out');
t.igual('la dirección la pone el signo', clase(['TOKE* de PEDRO PEREZ'], -100), 'transfer_out');
t.igual('a una cuenta propia, con el nombre recortado', clase(['TOKE* a ANA PRUEBA G 1a2b3c'], -100), 'own_transfer');
t.igual('desde una cuenta propia, con el nombre dado vuelta', clase(['999888777: PRUEBA GOMEZ, ANA RD$', '.00'], 100), 'own_transfer');
t.igual('LBTR propia', clase(['LBTR 0004445556 ANA PRUEBA, BANCO EJEMPLO RD$', 'B1.X1 REF1'], 100), 'own_transfer');
t.igual('un hermano comparte los apellidos, no el nombre', clase(['TOKE* de PEDRO PRUEBA GOMEZ'], 100), 'transfer_in');
t.igual('otra Ana no es el titular', clase(['MB a 0001234567 ANA PEREZ'], -100), 'transfer_out');
t.cierto('el nombre sin tildes es el mismo', esDelTitular('ANA PRUEBA GOMEZ', 'ANA PRUEBA GÓMEZ'));
t.cierto('sin titular no hay transferencias propias', !esDelTitular('ANA PRUEBA GOMEZ', ''));
t.igual('lo que no se entiende no se adivina', clase(['AJUSTE CONTABLE REF 123456789'], 1000), 'other');
t.igual('la contraparte, con su cuenta', clasificar(['MB a 0001234567 PEDRO PEREZ GARCIA'], -1, TITULAR).contraparte,
  { cuenta: '0001234567', nombre: 'PEDRO PEREZ GARCIA' });
t.igual('sin cuenta (TOKE*), y sin la referencia pegada',
  clasificar(['TOKE* de PEDRO PEREZ 9x8y7z'], 1, TITULAR).contraparte, { cuenta: null, nombre: 'PEDRO PEREZ' });

// ── Limpiar ──────────────────────────────────────────────────────────────────

t.igual('enmascarar', enmascarar('Ref 123456789 y 1234, orden 12-34567'), 'Ref ··6789 y 1234, orden 12-··4567');
t.igual('nombre corto', nombreCorto('PEDRO PEREZ GARCIA'), 'Pedro P.');
t.igual('nombre que ya viene con inicial', nombreCorto('MARIA RODRIGUEZ L'), 'Maria R.');
t.igual('un solo nombre', nombreCorto('PEDRO'), 'Pedro');
t.igual('sin nombre', nombreCorto(''), '');
t.igual('comercio con sucursal', limpiarComercio('SHELL - PIANTINI'), 'Shell');
t.igual('comercio con marca y asterisco', limpiarComercio('PEDIDOSYA*PROPINA DO SD'), 'Pedidosya');
t.igual('comercio con número de orden', limpiarComercio('TIENDA ONLINE M*12-34567-89012'), 'Tienda Online');
t.igual('comercio con ciudad y referencias', limpiarComercio('FARMACIA EJEMPLO SANTO DGO, 123412341234 1234'),
  'Farmacia Ejemplo Santo Dgo');
t.igual('la clave de aprendizaje no depende de la sucursal',
  [claveDeComercio('SHELL - PIANTINI'), claveDeComercio('SHELL - NACO')], ['shell', 'shell']);
t.igual('dos palabras, solo letras, sin tildes', claveDeComercio('PANADERÍA LA ESQUINA 2, SD 1234'), 'panaderia la');
t.igual('el titular pasa a "tu cuenta"', sinTitular('Pago a ANA PRUEBA GOMEZ hoy', TITULAR), 'Pago a tu cuenta hoy');
t.igual('una palabra suelta del nombre no', sinTitular('ANA PEREZ', TITULAR), 'ANA PEREZ');
{
  const s = (detalle: string[], centavos: number) =>
    sanear(detalle, clasificar(detalle, centavos, TITULAR), centavos, TITULAR);
  t.igual('transferencia a un tercero', s(['MB a 0001234567 PEDRO PEREZ GARCIA'], -300000), {
    comercio: 'Pedro P.', descripcion: 'Transferencia a Pedro P. (··4567)', matchKey: 'a:4567', ultimos4Contraparte: '4567',
  });
  t.igual('transferencia de un tercero', s(['MB desde 009876543 MARIA RODRIGUEZ L'], 250000), {
    comercio: 'Maria R.', descripcion: 'Transferencia de Maria R. (··6543)', matchKey: 'de:6543', ultimos4Contraparte: '6543',
  });
  t.igual('pago ACH sin nombre', s(['Pago ACH BANCO a 0007654321'], -50000).descripcion, 'Transferencia a ··4321');
  t.igual('TOKE* a un tercero se aprende por el nombre corto', s(['TOKE* a PEDRO PEREZ 9x8y'], -100).matchKey, 'a:pedro p');
  t.igual('entre cuentas propias', s(['LBTR 0004445556 ANA PRUEBA, BANCO EJEMPLO RD$'], 80000), {
    comercio: '', descripcion: 'Entre tus cuentas (··5556)', matchKey: 'de:5556', ultimos4Contraparte: '5556',
  });
  t.igual('propia sin cuenta', s(['TOKE* a ANA PRUEBA G 1a2b3c'], -1).descripcion, 'Entre tus cuentas');
  t.igual('impuesto con su porcentaje', s(['PAGO IMPUESTO 0.15% DGII, 3 TRANS POR $ 7,000.00 Del'], -1050).descripcion,
    'Impuesto DGII 0.15%');
  t.igual('retiro', s(['CAJERO, 123456789012', 'RET DE C K ATM1'], -1).descripcion, 'Retiro de efectivo');
  t.igual('depósito, que se aprende por canal', [s(['X', '1 DEP ACTE A'], 1).descripcion, s(['X', '1 DEP ACTE A'], 1).matchKey],
    ['Depósito', 'dep:acte']);
  t.igual('seguro', s(['BANCASEGURO DIC 2026 RD$', '.00'], -1).descripcion, 'Seguro del banco');
  t.igual('lo que no se entiende, enmascarado', s(['AJUSTE CONTABLE REF 123456789'], 1).descripcion,
    'Ajuste Contable Ref ··6789');
  t.cierto('nunca más de 120', s(['AJUSTE ' + 'MUY LARGO '.repeat(30)], 1).descripcion.length <= 120);
  t.igual('devolución', s(['TIENDA ONLINE M*12-34567-89012', '123-, 432143214321', '654321 OS CR RTN 8765'], 60000).descripcion,
    'Devolución de Tienda Online');
}

// ── Claves ───────────────────────────────────────────────────────────────────

t.igual('el mismo vector que la función SQL', claveDeLinea('2026-09-09', -4000, 1260000, 1), '2026-09-09|-4000|1260000|1');
{
  const mellizas = [
    { asentada: '2026-09-09', centavos: -4000, saldoCentavos: 1260000 },
    { asentada: '2026-09-09', centavos: 4000, saldoCentavos: 1264000 },
    { asentada: '2026-09-09', centavos: -4000, saldoCentavos: 1260000 },
  ];
  t.igual('−40, +40, −40: la tercera repite la terna de la primera', clavesDelEstado(mellizas),
    ['2026-09-09|-4000|1260000|0', '2026-09-09|4000|1264000|0', '2026-09-09|-4000|1260000|1']);
  t.igual('estables', clavesDelEstado(mellizas), clavesDelEstado(mellizas.map(l => ({ ...l }))));
  const todas = clavesDelEstado(cruda.lineas);
  t.igual('dos estados que se pisan comparten las claves de lo que se pisa',
    clavesDelEstado(cruda.lineas.slice(2, 10)).slice(0, 3), todas.slice(2, 5));
  t.cierto('las mellizas del sintético no chocan', todas[5].endsWith('|0') && todas[7].endsWith('|1') &&
    todas[5].slice(0, -2) === todas[7].slice(0, -2));
  t.igual('ninguna clave repetida', new Set(todas).size, todas.length);
}

// ── Interpretar: lo que viaja al cliente ─────────────────────────────────────

const leido = interpretar(cruda);
if (!leido.ok) {
  t.falla(`el sintético no se interpretó: ${JSON.stringify(leido)}`);
} else {
  const e = leido.extracto;
  const porClase: Record<string, number> = {};
  for (const l of e.lineas) porClase[l.clase] = (porClase[l.clase] ?? 0) + 1;
  const ordenado = (o: Record<string, number>) => Object.entries(o).sort((a, b) => a[0].localeCompare(b[0]));
  t.igual('una de cada clase, como se espera', ordenado(porClase), ordenado(ESPERADO.porClase));
  t.igual('conciliación', e.conciliacion, { lineas: ESPERADO.lineas, creditos: ESPERADO.creditos, debitos: ESPERADO.debitos });
  t.igual('período por fechas de entrada', [e.desde, e.hasta], ['2026-12-08', '2027-01-06']);
  t.igual('saldos', [e.saldoInicialCentavos, e.saldoFinalCentavos], [SALDO_ANTERIOR, estado.saldoFinal]);
  const devolucion = e.lineas.find(l => l.clase === 'refund');
  t.igual('la devolución apunta a su compra por el número de orden', devolucion?.devolucionDe, e.lineas[13].clave);
  t.igual('las demás no apuntan a nada', e.lineas.filter(l => l.devolucionDe).length, 1);
  t.igual('las claves son las de `clavesDelEstado`', e.lineas.map(l => l.clave), clavesDelEstado(cruda.lineas));

  // La privacidad: nada de esto puede salir del servidor.
  const json = JSON.stringify(e);
  t.cierto('sin el nombre del titular', !/ANA PRUEBA|PRUEBA GOMEZ|prueba|gomez/i.test(json));
  t.cierto('sin el número de cuenta entero', !json.includes(CUENTA));
  t.cierto('sin el IBAN', !json.includes(IBAN) && !json.includes('BPDO'));
  t.cierto('sin el campo titular', !('titular' in e));
  const textos = e.lineas.flatMap(l => [l.descripcion, l.comercio, l.matchKey]);
  t.igual('ninguna tira de 5 dígitos en lo que se muestra o se guarda', textos.filter(s => /\d{5,}/.test(s)), []);
  t.cierto('descripciones de 120 como mucho', e.lineas.every(l => l.descripcion.length <= 120 && l.matchKey.length <= 60));
}
{
  // Una devolución sin su compra en el estado queda sin pareja: no se inventa.
  const sinCompra = { ...cruda, lineas: cruda.lineas.map((l, i) => (i === 13 ? { ...l, detalle: ['OTRA TIENDA', 'SDO, 1 POS W/D'] } : l)) };
  const r = interpretar(sinCompra);
  t.igual('devolución sin compra', r.ok ? r.extracto.lineas[15].devolucionDe : 'no cuadró', null);
}

// ── Base64 ───────────────────────────────────────────────────────────────────

for (const n of [0, 1, 2, 3, 4, 5, 100, 3 * 8192 + 1, 100003]) {
  const bytes = new Uint8Array(n).map((_, i) => (i * 7919 + n) % 256);
  const b64 = bytesABase64(bytes);
  t.cierto(`base64 de ${n} bytes igual que Node`, b64 === Buffer.from(bytes).toString('base64'));
  const vuelta = base64ABytes(b64);
  t.cierto(`y de vuelta (${n})`, !!vuelta && vuelta.length === n && vuelta.every((b, i) => b === bytes[i]));
}
for (const malo of ['abc', 'ab$=', '====', 'a=bc']) t.igual(`base64 inválido: "${malo}"`, base64ABytes(malo), null);
t.igual('con saltos de línea en el medio', Array.from(base64ABytes('SG9s\nYQ==') ?? []), [72, 111, 108, 97]);

t.resumen();
