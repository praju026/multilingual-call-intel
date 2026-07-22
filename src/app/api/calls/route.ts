import { NextResponse } from 'next/server';
import { getCalls } from '@/lib/db';
import { getAuthenticatedUserId } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const calls = await getCalls(userId);
    return NextResponse.json({ success: true, calls });
  } catch (error: any) {
    console.error('Fetch calls API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch calls.' }, { status: 500 });
  }
}
