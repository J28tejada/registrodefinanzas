import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Groq from 'groq-sdk';
import {
  getGmailToken,
  updateGmailTokenAccess,
  updateGmailLastChecked,
  createEmailTransaction,
} from '@/lib/db';
import { getValidAccessToken, listMessageIds, fetchEmailContent } from '@/lib/gmail';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Eres un parser de correos de notificaciones bancarias. Tu tarea es analizar el contenido de un correo y extraer la información de la transacción financiera.

Si el correo contiene una transacción bancaria, responde ÚNICAMENTE con un JSON válido con esta estructura:
{"type":"expense|income","amount":NUMBER,"description":"descripción breve","category":"categoría","date":"YYYY-MM-DD","bankName":"nombre del banco"}

Si NO es un correo de transacción bancaria, responde ÚNICAMENTE con la cadena: null

Categorías válidas para gastos (expense): Alimentación, Transporte, Salud, Entretenimiento, Ropa, Educación, Servicios básicos, Hogar, Suscripciones, Materiales, Marketing, Equipo/Tecnología, Otros personal, Otros negocio
Categorías válidas para ingresos (income): Salario, Freelance, Inversiones, Ventas, Servicios prestados, Comisiones, Otros ingreso personal, Otros ingreso negocio

Reglas:
- amount debe ser un número positivo
- date en formato YYYY-MM-DD
- Si no puedes determinar la categoría exacta, usa "Otros personal" para gastos o "Otros ingreso personal" para ingresos
- description debe ser concisa (máximo 80 caracteres)
- NO incluyas texto extra, SOLO el JSON o null`;

export async function POST() {
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const token = await getGmailToken(userId);
    if (!token) {
      return NextResponse.json({ error: 'Gmail no conectado' }, { status: 400 });
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (token.lastChecked > fiveMinutesAgo) {
      return NextResponse.json({ skipped: true });
    }

    const validToken = await getValidAccessToken(token);
    if (validToken.refreshed && validToken.newExpiry) {
      await updateGmailTokenAccess(userId, {
        accessToken: validToken.accessToken,
        expiry: validToken.newExpiry,
      });
    }

    const afterMs = token.lastChecked > 0
      ? token.lastChecked
      : Date.now() - 7 * 24 * 3600 * 1000;

    const messageIds = await listMessageIds(validToken.accessToken, afterMs);
    const toProcess = messageIds.slice(0, 10);

    let processed = 0;
    let added = 0;

    for (const messageId of toProcess) {
      try {
        const email = await fetchEmailContent(validToken.accessToken, messageId);
        const userContent = `Asunto: ${email.subject}\nFecha: ${email.date}\nFragmento: ${email.snippet}\n\nCuerpo:\n${email.body}`;

        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          max_tokens: 200,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? 'null';
        processed++;

        if (raw === 'null' || !raw) continue;

        let parsed: {
          type: string;
          amount: number;
          description: string;
          category: string;
          date: string;
          bankName?: string;
        };
        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        if (!parsed.type || !parsed.amount || !parsed.description || !parsed.category || !parsed.date) {
          continue;
        }
        if (!['income', 'expense'].includes(parsed.type)) continue;
        if (parsed.amount <= 0) continue;

        const result = await createEmailTransaction(userId, {
          emailId: messageId,
          type: parsed.type as 'income' | 'expense',
          scope: 'personal',
          amount: parsed.amount,
          description: parsed.description,
          category: parsed.category,
          date: parsed.date,
          bankName: parsed.bankName,
        });

        if (result) added++;
      } catch (err) {
        console.error(`Error processing message ${messageId}:`, err);
      }
    }

    await updateGmailLastChecked(userId, Date.now());

    return NextResponse.json({ processed, added });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Gmail sync error:', msg);
    return NextResponse.json({ error: 'Error al sincronizar correos', detail: msg }, { status: 500 });
  }
}
