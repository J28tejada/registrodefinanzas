import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getChatHistory, saveChatHistory } from '@/lib/db';

export async function GET() {
  let userId: string | null = null;
  try { ({ userId } = await auth()); } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 401 }); }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const json = await getChatHistory(userId);
    return new Response(json, { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return NextResponse.json({ error: 'Error', detail: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let userId: string | null = null;
  try { ({ userId } = await auth()); } catch { return NextResponse.json({ error: 'No autorizado' }, { status: 401 }); }
  if (!userId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const { messages } = await req.json();
    await saveChatHistory(userId, JSON.stringify(messages));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'Error', detail: String(err) }, { status: 500 });
  }
}
