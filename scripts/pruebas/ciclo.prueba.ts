import { crear } from './aserciones';
import {
  proximoCorte, corteAnterior, pagoDelCorte, proximoPago, diasEntre, sumarDias,
} from '@/lib/tarjetas';

const t = crear('ciclo');

// ─── Recorte a meses cortos ───
t.igual('corte 31 en feb no bisiesto', proximoCorte('2026-02-01', 31), '2026-02-28');
t.igual('corte 31 en feb bisiesto',    proximoCorte('2024-02-01', 31), '2024-02-29');
t.igual('corte 31 en abril',           proximoCorte('2026-04-01', 31), '2026-04-30');
t.igual('corte 30 en feb',             proximoCorte('2026-02-01', 30), '2026-02-28');

// ─── proximoCorte ───
t.igual('antes del corte',    proximoCorte('2026-08-10', 25), '2026-08-25');
t.igual('el dia del corte',   proximoCorte('2026-08-25', 25), '2026-08-25');
t.igual('pasado el corte',    proximoCorte('2026-08-26', 25), '2026-09-25');
t.igual('cruza el ano',       proximoCorte('2026-12-26', 25), '2027-01-25');
t.igual('ultimo dia del mes', proximoCorte('2026-01-31', 31), '2026-01-31');
t.igual('corte 1 el dia 1',   proximoCorte('2026-08-01', 1),  '2026-08-01');
t.igual('corte 1 el dia 2',   proximoCorte('2026-08-02', 1),  '2026-09-01');

// ─── corteAnterior ───
t.igual('anterior es exclusivo', corteAnterior('2026-08-25', 25), '2026-07-25');
t.igual('anterior comun',        corteAnterior('2026-08-26', 25), '2026-08-25');
t.igual('anterior cruza ano',    corteAnterior('2026-01-10', 25), '2025-12-25');
t.igual('anterior feb corto',    corteAnterior('2026-03-01', 31), '2026-02-28');
t.igual('anterior en enero',     corteAnterior('2026-01-05', 31), '2025-12-31');

// ─── pagoDelCorte ───
t.igual('corte 25 pago 10',         pagoDelCorte('2026-08-25', 25, 10), '2026-09-10');
t.igual('corte 25 pago 10 dic',     pagoDelCorte('2026-12-25', 25, 10), '2027-01-10');
t.igual('corte 5 pago 25 mismo',    pagoDelCorte('2026-08-05', 5, 25),  '2026-08-25');
t.igual('corte 25 pago 25 iguales', pagoDelCorte('2026-08-25', 25, 25), '2026-09-25');
t.igual('corte 31 pago 15',         pagoDelCorte('2026-01-31', 31, 15), '2026-02-15');
t.igual('corte 31 pago 31',         pagoDelCorte('2026-01-31', 31, 31), '2026-02-28');

// ─── proximoPago ───
t.igual('pago del corte cerrado',  proximoPago('2026-11-05', 25, 10), '2026-11-10');
t.igual('hoy es el vencimiento',   proximoPago('2026-11-10', 25, 10), '2026-11-10');
t.igual('pasado el vencimiento',   proximoPago('2026-11-11', 25, 10), '2026-12-10');
t.igual('despues del corte nuevo', proximoPago('2026-11-26', 25, 10), '2026-12-10');
t.igual('mismo mes, tarde',        proximoPago('2026-11-26', 5, 25),  '2026-12-25');
t.igual('mismo mes, temprano',     proximoPago('2026-11-03', 5, 25),  '2026-11-25');
t.igual('cruce de ano',            proximoPago('2026-12-28', 25, 10), '2027-01-10');

// ─── diasEntre / sumarDias ───
t.igual('tres dias',        diasEntre('2026-08-15', '2026-08-18'), 3);
t.igual('cero dias',        diasEntre('2026-08-18', '2026-08-18'), 0);
t.igual('negativo',         diasEntre('2026-08-20', '2026-08-18'), -2);
t.igual('cruza mes',        diasEntre('2026-01-30', '2026-02-02'), 3);
t.igual('cruza ano',        diasEntre('2026-12-30', '2027-01-02'), 3);
t.igual('cruza bisiesto',   diasEntre('2024-02-28', '2024-03-01'), 2);
t.igual('cruza no bisiesto',diasEntre('2026-02-28', '2026-03-01'), 1);
// El cambio de horario cae el 8 de marzo de 2026: en hora local serían 23 o 25
// horas; contados en UTC tienen que seguir siendo tres días.
t.igual('cruza cambio hora', diasEntre('2026-03-07', '2026-03-10'), 3);
t.igual('sumar dias',        sumarDias('2026-02-27', 3), '2026-03-02');
t.igual('restar dias',       sumarDias('2026-03-02', -3), '2026-02-27');

// ─── Barrido ───
//
// Todas las combinaciones de día de corte y de pago, para cada día de cuatro
// años (uno bisiesto). Es la única forma de estar seguro de que no queda un
// off-by-one escondido en un mes raro.
const dias: string[] = [];
for (let ms = Date.UTC(2024, 0, 1); ms <= Date.UTC(2027, 11, 31); ms += 86400000) {
  dias.push(new Date(ms).toISOString().slice(0, 10));
}

let barridos = 0;
let rotos = 0;
for (let corte = 1; corte <= 31 && rotos < 10; corte++) {
  for (const pago of [1, 2, 5, 10, 15, 25, 28, 30, 31, corte]) {
    for (const hoy of dias) {
      barridos++;
      const ant = corteAnterior(hoy, corte);
      const prox = proximoCorte(hoy, corte);
      const vence = proximoPago(hoy, corte, pago);

      const mal = (m: string) => { rotos++; t.falla(m); };
      if (!(ant < hoy)) mal(`corteAnterior<hoy falla: hoy=${hoy} corte=${corte} ant=${ant}`);
      if (!(prox >= hoy)) mal(`proximoCorte>=hoy falla: hoy=${hoy} corte=${corte} prox=${prox}`);
      if (!(vence >= hoy)) mal(`proximoPago>=hoy falla: hoy=${hoy} c=${corte} p=${pago} vence=${vence}`);
      // Un ciclo dura entre 28 y 31 días: 0 o 60 significaría la cuenta corrida.
      const largo = diasEntre(ant, prox);
      if (largo < 28 || largo > 31) mal(`largo de ciclo ${largo}: hoy=${hoy} corte=${corte}`);
      if (!(pagoDelCorte(ant, corte, pago) >= ant)) mal(`pago antes del corte: ${ant} d=${corte} p=${pago}`);
      // El vencimiento tiene que salir de uno de los dos cortes que rodean a hoy.
      const candidatos = [pagoDelCorte(ant, corte, pago), pagoDelCorte(prox, corte, pago)];
      if (!candidatos.includes(vence)) mal(`vence no sale de un corte: hoy=${hoy} c=${corte} p=${pago}`);
      if (rotos >= 10) break;
    }
    if (rotos >= 10) break;
  }
}
if (rotos === 0) t.suma(6);

t.resumen(`${barridos.toLocaleString('es')} combinaciones barridas`);
