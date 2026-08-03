import { NextResponse } from 'next/server';
import { getCalls } from '@/lib/db';
import { getAuthSession } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { userId, orgId } = await getAuthSession();
    
    // Fetch calls belonging to the specific organization if orgId exists, else personal calls
    const calls = await getCalls(userId, orgId);
    
    return NextResponse.json({ success: true, calls });
  } catch (error: any) {
    console.error('Fetch calls API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch calls.' }, { status: 500 });
  }
}
