import { NextRequest } from 'next/server';
import Groq from 'groq-sdk';
import { getSummary, getAllTransactions } from '@/lib/db';
import { formatCurrency } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500 });
    }

    const [summary, recentTx] = await Promise.all([
      getSummary(),
      getAllTransactions({}),
    ]);
    const top20 = recentTx.slice(0, 20);

    const summaryText = `
RESUMEN FINANCIERO ACTUAL DEL USUARIO:
- Balance personal: ${formatCurrency(summary.personalBalance)} (ingresos: ${formatCurrency(summary.personalIncome)}, gastos: ${formatCurrency(summary.personalExpenses)})
- Balance negocio: ${formatCurrency(summary.businessBalance)} (ingresos: ${formatCurrency(summary.businessIncome)}, gastos: ${formatCurrency(summary.businessExpenses)})
- Balance total: ${formatCurrency(summary.totalBalance)}

ÚLTIMAS 20 TRANSACCIONES:
${top20.map(t => `- [${t.date}] ${t.scope === 'personal' ? 'Personal' : 'Negocio'} | ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)} | ${t.category}: ${t.description}`).join('\n')}

CATEGORÍAS MÁS USADAS:
${summary.byCategory.slice(0, 10).map(c => `- ${c.scope}/${c.type}: ${c.category} = ${formatCurrency(c.total)} (${c.count} transacciones)`).join('\n')}`;

    const systemPrompt = `Eres un asistente financiero personal amigable, conciso y útil. Respondes en español.

Tienes acceso a los datos financieros del usuario:
${summaryText}

Puedes ayudar con:
- Análisis de gastos e ingresos
- Sugerencias de categorías para nuevas transacciones
- Consejos de ahorro y finanzas personales
- Responder preguntas sobre el estado financiero del usuario

Sé amigable, directo y práctico. Usa los datos reales del usuario en tus respuestas.`;

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? '';
          if (text) controller.enqueue(encoder.encode(text));
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
