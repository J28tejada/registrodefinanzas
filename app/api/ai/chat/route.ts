import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Groq from 'groq-sdk';
import { getSummary, getAllTransactions } from '@/lib/db';
import { formatCurrency, todayISO } from '@/lib/types';

const REGISTER_TOOL: Groq.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'registrar_transaccion',
    description: 'Registra una transacción financiera (gasto o ingreso) del usuario. Llama esta función SIEMPRE que el usuario mencione algo que quiera registrar: un pago, compra, gasto, ingreso, cobro, etc.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['expense', 'income'], description: 'expense=gasto, income=ingreso' },
        scope: { type: 'string', enum: ['personal', 'business'], description: 'personal o negocio/empresa' },
        amount: { type: 'number', description: 'Monto en pesos mexicanos' },
        category: { type: 'string', description: 'Categoría. Gastos personales: Alimentación, Transporte, Salud, Entretenimiento, Ropa, Educación, Servicios básicos, Hogar, Suscripciones, Otros personal. Ingresos personales: Salario, Freelance, Inversiones, Regalo, Otros ingreso personal. Gastos negocio: Materiales, Marketing, Equipo/Tecnología, Transporte negocio, Personal/Empleados, Oficina, Impuestos, Servicios negocio, Otros negocio. Ingresos negocio: Ventas, Servicios prestados, Comisiones, Proyectos, Otros ingreso negocio.' },
        description: { type: 'string', description: 'Descripción breve de la transacción' },
        date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD. Usa la fecha de hoy si no se especifica.' },
      },
      required: ['type', 'scope', 'amount', 'category', 'description', 'date'],
    },
  },
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  try {
    const { messages } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key no configurada' }), { status: 500 });
    }

    const [summary, recentTx] = await Promise.all([
      getSummary(userId),
      getAllTransactions(userId, {}),
    ]);
    const top20 = recentTx.slice(0, 20);

    const summaryText = `
RESUMEN FINANCIERO (mes actual):
- Balance personal: ${formatCurrency(summary.personalBalance)} (ingresos: ${formatCurrency(summary.personalIncome)}, gastos: ${formatCurrency(summary.personalExpenses)})
- Balance negocio: ${formatCurrency(summary.businessBalance)} (ingresos: ${formatCurrency(summary.businessIncome)}, gastos: ${formatCurrency(summary.businessExpenses)})
- Balance total: ${formatCurrency(summary.totalBalance)}

ÚLTIMAS 20 TRANSACCIONES:
${top20.map(t => `- [${t.date}] ${t.scope === 'personal' ? 'Personal' : 'Negocio'} | ${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)} | ${t.category}: ${t.description}`).join('\n') || '(sin transacciones aún)'}

TOP CATEGORÍAS:
${summary.byCategory.slice(0, 8).map(c => `- ${c.scope}/${c.type}: ${c.category} = ${formatCurrency(c.total)} (${c.count} tx)`).join('\n') || '(sin datos)'}`;

    const systemPrompt = `Eres un asistente financiero personal conversacional. Hoy es ${todayISO()}. Respondes en español, de forma breve y amigable.

Tienes acceso a los datos financieros del usuario:
${summaryText}

INSTRUCCIONES IMPORTANTES:
- Cuando el usuario mencione cualquier gasto, pago, compra, ingreso, cobro o transacción → llama INMEDIATAMENTE la función registrar_transaccion con los datos extraídos del mensaje.
- Si falta el monto, pregunta antes de llamar la función.
- Si el ámbito (personal/negocio) no está claro, dedúcelo del contexto o usa personal por defecto.
- Para análisis, preguntas o consejos sobre finanzas → responde con texto directamente.
- Sé conciso. Máximo 3-4 líneas por respuesta de texto.`;

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const stream = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      stream: true,
      tools: [REGISTER_TOOL],
      tool_choice: 'auto',
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
        let toolCallArgs = '';
        let hasToolCall = false;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (delta?.content) {
            controller.enqueue(encoder.encode(delta.content));
          }

          if (delta?.tool_calls) {
            hasToolCall = true;
            for (const tc of delta.tool_calls) {
              if (tc.function?.arguments) toolCallArgs += tc.function.arguments;
            }
          }
        }

        if (hasToolCall && toolCallArgs) {
          controller.enqueue(encoder.encode(`\n[PROPOSAL]${toolCallArgs}`));
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
