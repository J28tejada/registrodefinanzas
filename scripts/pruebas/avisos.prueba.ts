import { crear } from './aserciones';
import { avisosDeTarjetas, calcularSaldo, cicloDeTarjeta, sumarDias, DIAS_DE_AVISO } from '@/lib/tarjetas';
import type { Card, CardBalance } from '@/lib/types';

const t = crear('avisos');

const base: Card = {
  id: 'c1', name: 'Visa Popular', kind: 'credit', last4: '1234', issuer: 'Popular',
  color: 'blue', archived: false, credit_limit: 50000, statement_day: 25, due_day: 10,
  opening_balance: 0, opening_date: null, alerts: true, parent_id: null, created_at: '2026-01-01',
} as unknown as Card;

const totales = { charged: 20000, credited: 0, paid: 0, cycleCharged: 5000 };
const saldoDe = (c: Card, hoy: string) => new Map<string, CardBalance>([[c.id, calcularSaldo(c, totales, hoy)]]);

// ─── El caso que dio origen a la función: consumo 5000 + pago 5000 ───
{
  const b = calcularSaldo(base, { charged: 5000, credited: 0, paid: 5000, cycleCharged: 0 }, '2026-09-15');
  t.igual('consumo y pago iguales dejan saldo 0', b.saldo, 0);
  t.igual('  y nada por pagar', b.aPagar, 0);
  t.igual('  y el limite sin usar', b.usoDelLimite, 0);
  t.igual('  y el cupo entero disponible', b.disponible, 50000);
  const solo = calcularSaldo(base, { charged: 5000, credited: 0, paid: 0, cycleCharged: 0 }, '2026-09-15');
  t.igual('solo el consumo deja 5000', solo.saldo, 5000);
  t.igual('  que es el 10% del cupo', solo.usoDelLimite, 10);
}

// ─── Bordes del saldo ───
{
  const favor = calcularSaldo(base, { charged: 1000, credited: 0, paid: 3000, cycleCharged: 0 }, '2026-09-15');
  t.igual('pagar de mas deja saldo a favor', favor.saldo, -2000);
  t.igual('  sin a-pagar negativo', favor.aPagar, 0);
  t.igual('  sin uso negativo', favor.usoDelLimite, 0);
  t.igual('  sin disponible por encima del cupo', favor.disponible, 50000);

  const sobre = calcularSaldo(base, { charged: 60000, credited: 0, paid: 0, cycleCharged: 0 }, '2026-09-15');
  t.igual('sobregiro pasa del 100%', Math.round(sobre.usoDelLimite!), 120);
  t.igual('  y el disponible va en negativo', sobre.disponible, -10000);

  const inicial = calcularSaldo({ ...base, opening_balance: 12000, opening_date: '2026-08-01' },
    { charged: 2000, credited: 0, paid: 0, cycleCharged: 2000 }, '2026-09-15');
  t.igual('el saldo inicial se suma', inicial.saldo, 14000);

  const dev = calcularSaldo(base, { charged: 5000, credited: 800, paid: 0, cycleCharged: 0 }, '2026-09-15');
  t.igual('una devolucion baja el saldo', dev.saldo, 4200);
}

// ─── Sin configurar no rompe nada ───
{
  const c = { ...base, credit_limit: null, statement_day: null, due_day: null } as Card;
  const b = calcularSaldo(c, totales, '2026-09-15');
  t.igual('sin limite no hay disponible', b.disponible, null);
  t.igual('sin limite no hay porcentaje', b.usoDelLimite, null);
  t.igual('sin fechas no hay ciclo', b.ciclo, null);
  t.igual('y no genera avisos', avisosDeTarjetas([c], saldoDe(c, '2026-09-15')).length, 0);
}

// ─── El "no me molestes" se respeta ───
{
  const apagada = { ...base, alerts: false } as Card;
  t.igual('avisos apagados no avisan', avisosDeTarjetas([apagada], saldoDe(apagada, '2026-09-22')).length, 0);
  const archivada = { ...base, archived: true } as Card;
  t.igual('una archivada tampoco', avisosDeTarjetas([archivada], saldoDe(archivada, '2026-09-22')).length, 0);
}

// ─── Noventa corridas diarias del cron, con el mismo candado que usa de verdad ───
{
  const mandados = new Set<string>();
  const registro: { dia: string; kind: string; objetivo: string; faltan: number }[] = [];

  for (let i = 0; i < 90; i++) {
    const hoy = sumarDias('2026-09-01', i);
    for (const a of avisosDeTarjetas([base], saldoDe(base, hoy))) {
      const llave = `${a.card.id}|${a.kind}|${a.date}|${a.daysBefore}`;
      if (mandados.has(llave)) { t.falla(`aviso repetido: ${llave}`); continue; }
      mandados.add(llave);
      registro.push({ dia: hoy, kind: a.kind, objetivo: a.date, faltan: a.daysBefore });
    }
  }

  const cortes = registro.filter(r => r.kind === 'statement');
  const pagos = registro.filter(r => r.kind === 'due');
  t.igual('tres cortes avisados, cuatro dias cada uno', cortes.length, 3 * (DIAS_DE_AVISO + 1));
  t.igual('tres pagos avisados, cuatro dias cada uno', pagos.length, 3 * (DIAS_DE_AVISO + 1));
  t.igual('el primer corte avisa los cuatro dias', cortes.slice(0, 4).map(r => r.dia),
    ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
  t.igual('y siempre apunta al mismo dia', cortes.slice(0, 4).map(r => r.objetivo),
    ['2026-09-25', '2026-09-25', '2026-09-25', '2026-09-25']);
  t.igual('con la cuenta regresiva bien', cortes.slice(0, 4).map(r => r.faltan), [3, 2, 1, 0]);
  t.igual('el primer pago avisa los cuatro dias', pagos.slice(0, 4).map(r => r.dia),
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']);

  const fuera = registro.filter(r => r.faltan < 0 || r.faltan > DIAS_DE_AVISO);
  t.igual('ninguno se manda fuera de la ventana', fuera, []);

  const porObjetivo = new Map<string, number>();
  for (const r of registro) {
    const k = `${r.kind}|${r.objetivo}`;
    porObjetivo.set(k, (porObjetivo.get(k) ?? 0) + 1);
  }
  const mal = [...porObjetivo].filter(([, n]) => n !== DIAS_DE_AVISO + 1);
  t.igual('cada vencimiento recibe exactamente cuatro', mal, []);
}

// ─── Un corte a fin de mes, cada día de un año largo ───
{
  const c = { ...base, statement_day: 31, due_day: 15 } as Card;
  const negativos: string[] = [];
  for (let i = 0; i < 400; i++) {
    const hoy = sumarDias('2026-01-01', i);
    const ciclo = cicloDeTarjeta(c, hoy)!;
    if (ciclo.daysToStatement < 0 || ciclo.daysToDue < 0) negativos.push(hoy);
  }
  t.igual('corte el 31: la cuenta regresiva nunca va al reves', negativos, []);
}

t.resumen();
