import { NextResponse } from 'next/server';
import { getEmailConnection } from '@/lib/db';

export async function GET() {
  try {
    const connection = await getEmailConnection();
    if (!connection) return NextResponse.json({ connected: false });
    return NextResponse.json({ connected: true, email: connection.email });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ connected: false });
  }
}
