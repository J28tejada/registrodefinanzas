import { crear } from './aserciones';
import { cicloDeTarjeta, sumarDias } from '@/lib/tarjetas';
import {
  compraDelIndice, compraEnLaPosicion, dentroDelCiclo, diasParaPagar, indiceDeCompra,
  lineaDeTiempo, posicionDe, resumenDeDiasParaPagar, textosDeLaLinea,
} from '@/lib/linea-de-tiempo';
import { Card } from '@/lib/types';

const t = crear('linea-de-tiempo');

// ─── Casos de oro ───
//
// Los que se reconocen de un estado de cuenta: corte 25 y pago 10, lo de acá.

const comun = lineaDeTiempo('2026-12-03', 25, 10);
t.igual('25/10 · inicio', comun.inicio, '2026-11-26');
t.igual('25/10 · corte', comun.corte, '2026-12-25');
t.igual('25/10 · pago', comun.pago, '2027-01-10');
t.igual('25/10 · el máximo, comprando el 26', comun.maximo, 45);
t.igual('25/10 · el mínimo, comprando el día del corte', comun.minimo, 16);
t.igual('25/10 · 30 días de compra', comun.diasDelCiclo, 30);
t.igual('25/10 · comprando hoy', diasParaPagar('2026-12-03', 25, 10).dias, 38);
// El día después del corte ya es otro ciclo, y vuelve a dar lo máximo.
t.igual('25/10 · el 26 entra en el corte de enero', diasParaPagar('2026-12-26', 25, 10),
  { corte: '2027-01-25', pago: '2027-02-10', dias: 46 });

// Pago después del corte: vence en el mismo mes.
const mismoMes = lineaDeTiempo('2026-11-20', 5, 25);
t.igual('5/25 · ciclo', [mismoMes.inicio, mismoMes.corte, mismoMes.pago],
  ['2026-11-06', '2026-12-05', '2026-12-25']);
t.igual('5/25 · extremos', [mismoMes.maximo, mismoMes.minimo], [49, 20]);

// Corte 31 en febrero: se corre al 28 (o al 29), y el ciclo de marzo arranca el 1.
const febrero = lineaDeTiempo('2026-02-10', 31, 20);
t.igual('31 en feb · ciclo', [febrero.inicio, febrero.corte, febrero.pago],
  ['2026-02-01', '2026-02-28', '2026-03-20']);
t.igual('31 en feb · extremos', [febrero.maximo, febrero.minimo, febrero.diasDelCiclo], [47, 20, 28]);
const bisiesto = lineaDeTiempo('2024-02-10', 31, 20);
t.igual('31 en feb bisiesto', [bisiesto.corte, bisiesto.maximo, bisiesto.diasDelCiclo], ['2024-02-29', 48, 29]);
t.igual('31 · el 1 de marzo abre ciclo', lineaDeTiempo('2026-03-01', 31, 20).inicio, '2026-03-01');

// Pago 31 en un mes de 30: se corre al 30.
const abril = lineaDeTiempo('2026-04-05', 10, 31);
t.igual('pago 31 en abril', [abril.pago, abril.maximo, abril.minimo], ['2026-04-30', 50, 20]);
// Y si el corte también se corre al mismo día, no queda gracia: cero, no negativo.
const sinGracia = lineaDeTiempo('2026-04-15', 30, 31);
t.igual('corte 30 pago 31 en abril', [sinGracia.corte, sinGracia.pago, sinGracia.minimo, sinGracia.posicionDelCorte],
  ['2026-04-30', '2026-04-30', 0, 1]);

// Los extremos de la configuración: un día de gracia y dos meses casi enteros.
const corto = lineaDeTiempo('2026-11-15', 1, 2);
t.igual('1/2 · un día de gracia', [corto.corte, corto.pago, corto.minimo, corto.maximo],
  ['2026-12-01', '2026-12-02', 1, 30]);
const largo = lineaDeTiempo('2026-11-15', 15, 15);
t.igual('15/15 · vence el mes siguiente', [largo.corte, largo.pago, largo.minimo, largo.maximo],
  ['2026-11-15', '2026-12-15', 30, 60]);

// ─── Los textos ───
//
// "~" es el espacio duro que va entre el número y lo que cuenta, para que no
// queden en renglones distintos.

const duro = (texto: string) => texto.replace(/~/g, '\u00a0');

const textos = textosDeLaLinea(comun, '2026-12-03');
t.igual('textos · hoy', textos, {
  numero: '38',
  unidad: 'días',
  frase: duro('Si la usás hoy, tenés hasta el 10~ene.'),
  inicio: duro('26~nov'),
  corte: duro('Corte 25~dic'),
  pago: duro('Pago 10~ene'),
  // El próximo día después del corte, con sus días: los del ciclo de enero.
  consejo: duro('Conviene usarla el día después del corte: el 26~dic da 46~días. El día del corte da 16~días.'),
  valor: duro('3~dic: 38~días para pagar'),
});
t.igual('frase · mañana', textosDeLaLinea(comun, '2026-12-04').frase,
  duro('Si la usás mañana, tenés hasta el 10~ene.'));
t.igual('frase · ayer', textosDeLaLinea(comun, '2026-12-02').frase,
  duro('Si la usaste ayer, tenés hasta el 10~ene.'));
t.igual('frase · más adelante', textosDeLaLinea(comun, '2026-12-20').frase,
  duro('Si la usás el 20~dic, tenés hasta el 10~ene.'));
t.igual('frase · ya pasó', textosDeLaLinea(comun, '2026-11-26').frase,
  duro('Si la usaste el 26~nov, tenés hasta el 10~ene.'));
// El consejo cambia en los dos bordes del ciclo, que es cuando más sirve.
t.igual('consejo · hoy es el corte', textosDeLaLinea(lineaDeTiempo('2026-12-25', 25, 10), '2026-12-25').consejo,
  duro('Hoy es el corte: si esperás a mañana, tenés 46~días en vez de 16.'));
t.igual('consejo · el corte fue ayer', textosDeLaLinea(lineaDeTiempo('2026-12-26', 25, 10), '2026-12-26').consejo,
  'Hoy es el mejor día para usarla: el corte fue ayer, y lo que compres hoy entra recién en el próximo.');
const unDia = textosDeLaLinea(corto, '2026-12-01');
t.igual('un día · singular', [unDia.numero, unDia.unidad, unDia.valor], ['1', 'día', duro('1~dic: 1~día para pagar')]);
t.cierto('un día · consejo en singular', unDia.consejo.endsWith(duro('El día del corte da 1~día.')));
t.cierto('sin gracia · "ninguno"', textosDeLaLinea(sinGracia, '2026-04-15').consejo.endsWith('El día del corte no da ninguno.'));
t.igual('sin gracia · el día del corte', textosDeLaLinea(lineaDeTiempo('2026-04-30', 30, 31), '2026-04-30').consejo,
  duro('Hoy es el corte: si esperás a mañana, tenés 30~días en vez de ninguno.'));
t.igual('lista', resumenDeDiasParaPagar('2026-12-03', 25, 10), duro('Usándola hoy: 38~días para pagar'));
t.igual('lista · singular', resumenDeDiasParaPagar('2026-12-01', 1, 2), duro('Usándola hoy: 1~día para pagar'));
t.igual('lista · sin corte', resumenDeDiasParaPagar('2026-12-03', null, 10), null);
t.igual('lista · sin pago', resumenDeDiasParaPagar('2026-12-03', 25, null), null);

// ─── La barra ───

t.igual('posición del inicio', posicionDe(comun, comun.inicio), 0);
t.igual('posición del pago', posicionDe(comun, comun.pago), 1);
t.igual('posición del corte', posicionDe(comun, comun.corte), comun.posicionDelCorte);
t.igual('tocar antes del principio', compraEnLaPosicion(comun, -0.3), comun.inicio);
t.igual('tocar el tramo de gracia elige el corte', compraEnLaPosicion(comun, 0.9), comun.corte);
t.igual('tocar el final elige el corte', compraEnLaPosicion(comun, 1), comun.corte);
t.igual('redondea al día más cercano', compraEnLaPosicion(comun, 7.4 / 45), '2026-12-03');
t.igual('índice fuera del ciclo se recorta', [compraDelIndice(comun, -5), compraDelIndice(comun, 99)],
  [comun.inicio, comun.corte]);

// ─── Barrido ───
//
// Cada día de corte con cada día de pago, para cada día de dos años (2024 es
// bisiesto). Por cada "hoy" se arma la barra y se comprueba la compra de ese
// día: como "hoy" recorre todos los días, cada día de cada ciclo queda probado
// como compra. Son dos años y no cuatro como en `ciclo` porque acá cada vuelta
// hace diez cuentas: con dos ya pasan por todos los largos de mes, y el
// barrido sigue tardando segundos y no medio minuto.

const tarjeta = (corte: number, pago: number): Card => ({
  id: 'x', name: 'x', kind: 'credit', last4: '', issuer: '', color: 'blue', archived: false,
  credit_limit: null, statement_day: corte, due_day: pago, opening_balance: 0,
  opening_date: null, alerts: false, created_at: '2024-01-01T00:00:00Z',
});

const dias: string[] = [];
for (let ms = Date.UTC(2024, 0, 1); ms <= Date.UTC(2025, 11, 31); ms += 86400000) {
  dias.push(new Date(ms).toISOString().slice(0, 10));
}

let barridos = 0;
let rotos = 0;
let sinGraciaVistos = 0;
let mayorMaximo = 0;
const mal = (m: string) => { rotos++; t.falla(m); };

for (let corte = 1; corte <= 31 && rotos < 10; corte++) {
  for (let pago = 1; pago <= 31 && rotos < 10; pago++) {
    const card = tarjeta(corte, pago);
    let anterior: ReturnType<typeof lineaDeTiempo> | null = null;

    for (const hoy of dias) {
      barridos++;
      const L = lineaDeTiempo(hoy, corte, pago);
      const P = diasParaPagar(hoy, corte, pago);
      const caso = `hoy=${hoy} c=${corte} p=${pago}`;

      // Hoy siempre está adentro del ciclo que se dibuja.
      if (!dentroDelCiclo(L, hoy)) mal(`hoy fuera del ciclo: ${caso} ${L.inicio}..${L.corte}`);
      // Cualquier día del ciclo se paga el mismo día que la barra.
      if (P.corte !== L.corte || P.pago !== L.pago) mal(`otro corte o pago: ${caso}`);
      // Un día más tarde, un día menos: los días bajan de a uno en todo el ciclo.
      if (P.dias !== L.maximo - indiceDeCompra(L, hoy)) mal(`días fuera de escalón: ${caso} ${P.dias}`);
      if (hoy === L.inicio && P.dias !== L.maximo) mal(`el inicio no da el máximo: ${caso}`);
      if (hoy === L.corte && P.dias !== L.minimo) mal(`el corte no da el mínimo: ${caso}`);
      if (L.maximo - L.minimo !== L.diasDelCiclo - 1) mal(`máximo y mínimo no cuadran: ${caso}`);
      mayorMaximo = Math.max(mayorMaximo, L.maximo);

      // Un ciclo dura entre 28 y 31 días, y la gracia, entre 0 y 31.
      if (L.diasDelCiclo < 28 || L.diasDelCiclo > 31) mal(`ciclo de ${L.diasDelCiclo} días: ${caso}`);
      if (L.minimo < 0 || L.minimo > 31) mal(`gracia de ${L.minimo} días: ${caso}`);
      // Cero solo cuando el pago es del mismo mes y los dos se recortan al
      // último día (corte 30 pago 31 en abril, corte 29 pago 30 en febrero).
      if (L.minimo === 0) {
        sinGraciaVistos++;
        const ultimoDelMes = sumarDias(L.corte, 1).endsWith('-01');
        if (!(pago > corte && ultimoDelMes)) mal(`gracia cero sin recorte: ${caso}`);
      }

      // Las fracciones de la barra, en orden y entre 0 y 1.
      const pHoy = posicionDe(L, hoy);
      if (!(L.posicionDelCorte >= 0 && L.posicionDelCorte <= 1)) mal(`corte fuera de la barra: ${caso}`);
      if (!(pHoy >= 0 && pHoy <= L.posicionDelCorte)) mal(`hoy fuera de su tramo: ${caso}`);
      if (posicionDe(L, L.inicio) !== 0 || posicionDe(L, L.pago) !== 1) mal(`extremos de la barra: ${caso}`);
      // Tocar donde está dibujado un día elige ese día.
      if (compraEnLaPosicion(L, pHoy) !== hoy) mal(`tocar hoy no elige hoy: ${caso}`);

      // El día después del corte abre un ciclo nuevo, que vuelve a dar lo máximo.
      if (hoy === L.corte) {
        const despues = sumarDias(L.corte, 1);
        const siguiente = lineaDeTiempo(despues, corte, pago);
        if (dentroDelCiclo(L, despues)) mal(`el día después del corte sigue en el ciclo: ${caso}`);
        if (siguiente.inicio !== despues || siguiente.corte <= L.corte) mal(`el día después no abre ciclo: ${caso}`);
        if (diasParaPagar(despues, corte, pago).dias !== siguiente.maximo) mal(`el día después no da el máximo: ${caso}`);
      }

      // Los textos dicen el mismo número que la cuenta.
      if (hoy === L.inicio && textosDeLaLinea(L, hoy).numero !== String(P.dias)) mal(`el número del texto: ${caso}`);

      // Lo mismo que el estado de cuenta: el corte de la barra es el próximo
      // corte de la tarjeta, y el ciclo arranca después del último cerrado. El
      // próximo pago del estado puede ser todavía el del corte pasado, nunca
      // uno posterior al de la barra.
      //
      // Solo en los bordes del ciclo, que es donde se corre un día; adentro, la
      // comprobación de `anterior` de abajo ya garantiza que la barra no cambia.
      if (hoy === L.inicio || hoy === L.corte) {
        const ciclo = cicloDeTarjeta(card, hoy);
        if (!ciclo || ciclo.nextStatement !== L.corte) mal(`otro corte que el estado de cuenta: ${caso}`);
        if (ciclo && sumarDias(ciclo.lastStatement, 1) !== L.inicio) mal(`otro inicio que el estado de cuenta: ${caso}`);
        if (ciclo && ciclo.nextDue > L.pago) mal(`el estado de cuenta vence después que la barra: ${caso}`);
      }

      // Dos días del mismo ciclo dibujan la misma barra; el primero de uno
      // nuevo empieza justo después del corte del anterior.
      if (anterior) {
        if (hoy === L.inicio) {
          if (sumarDias(anterior.corte, 1) !== hoy) mal(`ciclos con hueco o solapados: ${caso}`);
        } else if (anterior.inicio !== L.inicio || anterior.corte !== L.corte || anterior.pago !== L.pago) {
          mal(`el ciclo cambió a mitad de camino: ${caso}`);
        }
      }
      anterior = L;
      if (rotos >= 10) break;
    }
  }
}
if (rotos === 0) t.suma(20);
// Si el recorte que deja la gracia en cero no apareció nunca, el barrido no
// estaría pasando por los meses cortos.
t.cierto('el barrido pasa por la gracia cero', sinGraciaVistos > 0);
// El número grande nunca pasa de dos cifras: la pieza se diseñó para eso.
t.cierto(`el máximo cabe en dos cifras (dio ${mayorMaximo})`, mayorMaximo <= 61);

t.resumen(`${barridos.toLocaleString('es')} combinaciones barridas`);
