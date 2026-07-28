import { NextResponse } from 'next/server';
import { getEmailConnection } from '@/lib/db';
import { conSesion } from '@/lib/supabase/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return conSesion(async db => {
    try {
      const connection = await getEmailConnection(db);
      if (!connection) return NextResponse.json({ connected: false });
      return NextResponse.json({ connected: true, email: connection.email });
    } catch (err) {
      return NextResponse.json({
        connected: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
