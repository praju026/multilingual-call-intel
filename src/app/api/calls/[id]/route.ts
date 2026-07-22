import { NextResponse } from 'next/server';
import { getCallById, deleteCall } from '@/lib/db';
import { deleteAudioFile } from '@/lib/storage';
import { getAuthenticatedUserId } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await props.params;
    const id = params.id;
    const userId = await getAuthenticatedUserId();
    const call = await getCallById(id, userId);

    if (!call) {
      return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, call });
  } catch (error: any) {
    console.error('Fetch call detail error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch call.' }, { status: 500 });
  }
}

export async function DELETE(
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

    // Delete file if it exists (cloud or local)
    await deleteAudioFile(call.audioUrl || call.filename);

    const deleted = await deleteCall(id, userId);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete call record.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Call deleted successfully.' });
  } catch (error: any) {
    console.error('Delete call error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete call.' }, { status: 500 });
  }
}
