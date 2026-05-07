import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSummary, getAllTransactions } from '@/lib/db';
import { formatCurrency } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500 });
    }

    const summary = getSummary();
    const recentTx = getAllTransactions({ }).slice(0, 20);

    const summaryText = `
RESUMEN FINANCIERO ACTUAL DEL USUARIO:
- Balance personal: ${formatCurrency(summary.personalBalance)} (ingresos: ${formatCurrency(summary.personalIncome)}, gastos: ${formatCurrency(summary.personalExpenses)})
- Balance negocio: ${formatCurrency(summary.businessBalance)} (ingresos: ${formatCurrency(summary.businessIncome)}, gastos: ${formatCurrency(summary.businessExpenses)})
- Balance total: ${formatCurrency(summary.totalBalance)}

ÚLTIMAS 20 TRANSACCIONES:
${recentTx.map(t => `- [${t.date}] ${t.scope === 'personal' ? 'Personal' : 'Negocio'} | ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)} | ${t.category}: ${t.description}`).join('\n')}

CATEGORÍAS MÁS USADAS:
${summary.byCategory.slice(0, 10).map(c => `- ${c.scope}/${c.type}: ${c.category} = ${formatCurrency(c.total)} (${c.count} transacciones)`).join('\n')}`;

    const client = new Anthropic();
    const stream = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      stream: true,
      system: `Eres un asistente financiero personal amigable, conciso y útil. Respondes en español.

Tienes acceso a los datos financieros del usuario:
${summaryText}

Puedes ayudar con:
- Análisis de gastos e ingresos
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
