import { NextResponse, after } from 'next/server';
import { getCallById, updateCall } from '@/lib/db';
import { processCall } from '@/lib/process';
import { getAuthSession } from '@/lib/auth-helper';
import { isServerlessEnvironment } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby max limit

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await props.params;
    const id = params.id;
    const { userId, orgId } = await getAuthSession();
    const call = await getCallById(id, userId, orgId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found or unauthorized.' }, { status: 404 });
    }

    // Parse optional language from request body
    let language: string | undefined = undefined;
    try {
      const body = await request.json();
      if (body && body.language) {
        language = body.language;
      }
    } catch (e) {
      // Ignore JSON parse errors if body is empty
    }

    // Reset status and error, update language if provided
    await updateCall(id, { 
      status: 'queued', 
      error: undefined,
      ...(language && { language })
    });

    // Run processCall synchronously since Webhooks make it return immediately
    try {
      await processCall(id);
    } catch (err) {
      console.error(`Processing for call ${id} failed:`, err);
    }

    return NextResponse.json({ success: true, message: 'Processing triggered.' });
  } catch (error: any) {
    console.error('Trigger process API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to trigger processing.' }, { status: 500 });
  }
}
