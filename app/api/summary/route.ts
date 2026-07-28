import { NextRequest, NextResponse } from 'next/server';
import { getSummary } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return conSesion(async db => {
    try {
      const { searchParams } = req.nextUrl;
      const summary = await getSummary(
        db,
        searchParams.get('ledger_id') ?? undefined,
        searchParams.get('startDate') ?? undefined,
        searchParams.get('endDate') ?? undefined,
      );
      return NextResponse.json(summary);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  });
}
