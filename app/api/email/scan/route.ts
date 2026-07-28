import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getEmailConnection } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';
import { fetchBankEmails } from '@/lib/gmail';
import { EmailTransaction } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '');

async function parseEmailWithAI(
  subject: string,
  from: string,
  body: string,
): Promise<Omit<EmailTransaction, 'gmail_message_id' | 'subject' | 'from_address' | 'sent_date'>> {
  const prompt = `Analiza este correo electrónico de un banco o servicio financiero y extrae la información de la transacción si la hay.

De: ${from}
Asunto: ${subject}
Cuerpo:
${body.slice(0, 2000)}

Responde ÚNICAMENTE con JSON válido en este formato exacto (sin markdown, sin texto extra):
{
  "isTransaction": true o false,
  "type": "expense" o "income" o null,
  "amount": número o null,
  "description": "descripción corta de la transacción" o null,
  "category": "categoría sugerida" o null,
  "confidence": número entre 0 y 1
}

Categorías válidas para gastos: Alimentación, Transporte, Salud, Entretenimiento, Ropa, Educación, Servicios básicos, Hogar, Suscripciones, Materiales, Marketing, Equipo/Tecnología, Impuestos, Otros
Categorías válidas para ingresos: Salario, Freelance, Ventas, Servicios prestados, Inversiones, Otros

Si el correo NO es una transacción financiera, devuelve: {"isTransaction": false, "type": null, "amount": null, "description": null, "category": null, "confidence": 0}`;

  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    return { isTransaction: false, type: null, amount: null, description: null, category: null, confidence: 0 };
  }
}

export async function GET() {
  return conSesion(async db => {
    try {
      const connection = await getEmailConnection(db);
      if (!connection) {
        return NextResponse.json({ error: 'No hay cuenta de correo conectada' }, { status: 401 });
      }

      const emails = await fetchBankEmails(connection.access_token, connection.refresh_token);

      const results: EmailTransaction[] = [];

      for (const email of emails) {
        const parsed = await parseEmailWithAI(email.subject, email.from, email.body);

        results.push({
          gmail_message_id: email.id,
          subject: email.subject,
          from_address: email.from,
          sent_date: email.date,
          ...parsed,
        });
      }

      const transactions = results.filter(r => r.isTransaction && (r.confidence ?? 0) > 0.4);

      return NextResponse.json({ transactions, total_scanned: emails.length });
    } catch (err) {
      console.error('Email scan error:', err);
      const message = err instanceof Error ? err.message : 'Error al escanear correos';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
