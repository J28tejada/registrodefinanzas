import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBudgetProgress, getSettings, getSummary, getAllTransactions, getAllLedgersWithStats } from '@/lib/db';
import { requireDb } from '@/lib/supabase/session';
import { hoyEnZona, limitesDelMes, makeFormatters } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    let db;
    try {
      db = await requireDb();
    } catch {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { messages } = await req.json();

    if (!process.env.GOOGLE_AI_API_KEY) {
      return NextResponse.json({ error: 'Falta GOOGLE_AI_API_KEY' }, { status: 500 });
    }

    const settings = await getSettings(db);
    const fmt = makeFormatters(settings);
    const { start, end } = limitesDelMes(hoyEnZona(settings.timezone));

    const [summary, recentTx, ledgers, budgets] = await Promise.all([
      getSummary(db),
      getAllTransactions(db, { limit: 20 }),
      getAllLedgersWithStats(db),
      getBudgetProgress(db, start, end),
    ]);

    const ledgersText = ledgers.length > 0
      ? `\nCUENTAS:\n${ledgers.map(l => `- ${l.name}: balance ${fmt.money(l.balance)} (${l.transactionCount} transacciones)`).join('\n')}`
      : '';

    const budgetsText = budgets.length > 0
      ? `\nPRESUPUESTOS DEL MES (tope mensual por categoría):\n${budgets.map(b =>
          `- ${b.category}: ${fmt.money(b.spent)} de ${fmt.money(b.amount)} (${b.percent}%)${b.percent >= 100 ? ' — PASADO' : ''}`,
        ).join('\n')}`
      : '';

    const systemPrompt = `Eres un asistente financiero personal amigable, conciso y útil. Respondes en español.
La moneda del usuario es ${settings.currency} y hoy es ${fmt.today()}.

Tienes acceso a los datos financieros del usuario:

RESUMEN FINANCIERO GLOBAL:
- Ingresos totales: ${fmt.money(summary.totalIncome)}
- Gastos totales: ${fmt.money(summary.totalExpenses)}
- Balance total: ${fmt.money(summary.totalBalance)}
${ledgersText}
${budgetsText}

ÚLTIMAS 20 TRANSACCIONES:
${recentTx.map(t => {
  const ledger = ledgers.find(l => l.id === t.ledger_id);
  return `- [${t.date}] ${ledger ? ledger.name : t.scope} | ${t.type === 'income' ? '+' : '-'}${fmt.money(t.amount)} | ${t.category}: ${t.description}`;
}).join('\n')}

CATEGORÍAS MÁS USADAS:
${summary.byCategory.slice(0, 10).map(c => `- ${c.type === 'income' ? 'Ingreso' : 'Gasto'}: ${c.category} = ${fmt.money(c.total)} (${c.count} transacciones)`).join('\n')}

Sé amigable, directo y práctico. Usa los datos reales del usuario en tus respuestas.`;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
      systemInstruction: systemPrompt,
    });

    // All messages except the last one go to history
    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const lastMessage = messages[messages.length - 1];

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage.content);

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of result.stream) {
          controller.enqueue(encoder.encode(chunk.text()));
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err) {
    console.error('Error en chat:', err);
    const detalle = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error en el chat: ${detalle}` }, { status: 500 });
  }
}
