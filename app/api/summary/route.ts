import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const ledger_id = searchParams.get('ledger_id') ?? undefined;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const summary = await getSummary(ledger_id, startDate, endDate);
    return NextResponse.json(summary);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Error al obtener resumen' }, { status: 500 });
  }
}
