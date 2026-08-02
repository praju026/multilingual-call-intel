import { NextResponse } from 'next/server';
import { getCallById, updateCall } from '@/lib/db';
import { processCall } from '@/lib/process';
import { getAuthenticatedUserId } from '@/lib/auth-helper';
import { isServerlessEnvironment } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await props.params;
    const id = params.id;
    const userId = await getAuthenticatedUserId();
    const call = await getCallById(id, userId);

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

    // Start background processing
    if (isServerlessEnvironment()) {
      await processCall(id).catch(err => {
        console.error(`Processing for call ${id} failed:`, err);
      });
    } else {
      processCall(id).catch(err => {
        console.error(`Background retried processing for call ${id} failed:`, err);
      });
    }

    return NextResponse.json({ success: true, message: 'Processing triggered.' });
  } catch (error: any) {
    console.error('Trigger process API error:', error);
    return NextResponse.json({ error: error.message || 'Failed to trigger processing.' }, { status: 500 });
  }
}
