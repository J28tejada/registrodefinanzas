import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Groq from 'groq-sdk';
import { todayISO } from '@/lib/types';

const SYSTEM_PROMPT = `Eres un asistente de finanzas personales. El usuario ingresó una descripción de una transacción (puede ser texto escrito o transcripción de voz en español).

Analiza el texto y extrae la información de la transacción financiera. Responde ÚNICAMENTE con un JSON válido, sin texto adicional, con esta estructura exacta:
{
  "type": "expense" o "income",
  "scope": "personal" o "business",
  "amount": número (sin símbolo de moneda),
  "category": string de las categorías disponibles,
  "description": string descriptivo breve,
  "date": "YYYY-MM-DD",
  "confidence": número entre 0 y 1,
  "suggestions": ["alternativa1", "alternativa2"],
  "paymentMethod": "cash" o "transfer" o "card" o null,
  "cardName": string o null
}

Categorías disponibles:
- Gastos personales: Alimentación, Transporte, Salud, Entretenimiento, Ropa, Educación, Servicios básicos, Hogar, Suscripciones, Otros personal
- Ingresos personales: Salario, Freelance, Inversiones, Regalo, Otros ingreso personal
- Gastos negocio: Materiales, Marketing, Equipo/Tecnología, Transporte negocio, Personal/Empleados, Oficina, Impuestos, Servicios negocio, Otros negocio
- Ingresos negocio: Ventas, Servicios prestados, Comisiones, Proyectos, Otros ingreso negocio

Reglas:
- Si menciona "negocio", "emprendimiento", "empresa", "cliente", "venta" → scope: business
- Si no está claro el ámbito → scope: personal
- Si dice "cobré", "me pagaron", "ingresó", "recibí dinero" → type: income
- Si dice "pagué", "gasté", "compré", "me cobró" → type: expense
- Para el monto, extrae el número. Si dice "500 pesos" → 500
- Para la fecha, usa la fecha actual si no se especifica
- confidence: qué tan seguro estás de la interpretación (0.9 = muy seguro, 0.5 = dudas)
- suggestions: 2 categorías alternativas posibles si hay ambigüedad
- paymentMethod: si menciona "efectivo" → "cash"; "transferencia" → "transfer"; "tarjeta", "crédito", "débito", o nombre de banco/tarjeta → "card"
- cardName: si el pago es con tarjeta y menciona el nombre del banco o tarjeta (ej: "BHD", "Popular", "Banreservas"), extráelo aquí
- Si un campo no se puede determinar, usa null`;

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'API key no configurada' }, { status: 500 });
    }

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Fecha actual: ${todayISO()}\n\nTexto del usuario: "${text}"` },
      ],
    });

    const jsonText = completion.choices[0].message.content ?? '';
    const parsed = JSON.parse(jsonText);
    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error interpretando:', message);
    if (err instanceof SyntaxError) {
      return NextResponse.json({ error: 'La IA no devolvió JSON válido', detail: message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Error al interpretar texto', detail: message }, { status: 500 });
  }
}
