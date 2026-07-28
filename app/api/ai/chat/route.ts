import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSummary, getAllTransactions, getAllLedgersWithStats } from '@/lib/db';
import { formatCurrency } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!process.env.GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500 });
    }

    const [summary, recentTx, ledgers] = await Promise.all([
      getSummary(),
      getAllTransactions({}),
      getAllLedgersWithStats(),
    ]);
    const top20 = recentTx.slice(0, 20);

    const ledgersText = ledgers.length > 0
      ? `\nCUENTAS:\n${ledgers.map(l => `- ${l.name}: balance ${formatCurrency(l.balance)} (${l.transactionCount} transacciones)`).join('\n')}`
      : '';

    const systemPrompt = `Eres un asistente financiero personal amigable, conciso y útil. Respondes en español.

Tienes acceso a los datos financieros del usuario:

RESUMEN FINANCIERO GLOBAL:
- Ingresos totales: ${formatCurrency(summary.totalIncome)}
- Gastos totales: ${formatCurrency(summary.totalExpenses)}
- Balance total: ${formatCurrency(summary.totalBalance)}
${ledgersText}

ÚLTIMAS 20 TRANSACCIONES:
${top20.map(t => {
  const ledger = ledgers.find(l => l.id === t.ledger_id);
  return `- [${t.date}] ${ledger ? ledger.name : t.scope} | ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)} | ${t.category}: ${t.description}`;
}).join('\n')}

CATEGORÍAS MÁS USADAS:
${summary.byCategory.slice(0, 10).map(c => `- ${c.type === 'income' ? 'Ingreso' : 'Gasto'}: ${c.category} = ${formatCurrency(c.total)} (${c.count} transacciones)`).join('\n')}

Sé amigable, directo y práctico. Usa los datos reales del usuario en tus respuestas.`;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
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
    return new Response(JSON.stringify({ error: 'Error en el chat' }), { status: 500 });
  }
}
