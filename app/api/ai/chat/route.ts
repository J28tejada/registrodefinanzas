import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSummary, getAllTransactions, getAllLedgersWithStats } from '@/lib/db';
import { formatCurrency } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
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

    const summaryText = `
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
${summary.byCategory.slice(0, 10).map(c => `- ${c.type === 'income' ? 'Ingreso' : 'Gasto'}: ${c.category} = ${formatCurrency(c.total)} (${c.count} transacciones)`).join('\n')}`;

    const client = new Anthropic();
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: `Eres un asistente financiero personal amigable, conciso y útil. Respondes en español.

Tienes acceso a los datos financieros del usuario:
${summaryText}

Puedes ayudar con:
- Análisis de gastos e ingresos por cuenta
- Sugerencias de categorías para nuevas transacciones
- Consejos de ahorro y finanzas personales
- Responder preguntas sobre el estado financiero del usuario
- Interpretar descripciones de gastos/ingresos y sugerir cómo registrarlos

Sé amigable, directo y práctico. Usa los datos reales del usuario en tus respuestas.`,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
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
