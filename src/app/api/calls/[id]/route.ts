import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getCallById, deleteCall } from '@/lib/db';
import { getUploadsDir } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await props.params;
    const id = params.id;
    const call = getCallById(id);

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
    const call = getCallById(id);

    if (!call) {
      return NextResponse.json({ error: 'Call not found.' }, { status: 404 });
    }

    // Delete file if it exists
    const uploadDir = getUploadsDir();
    const filePath = path.join(uploadDir, call.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        console.error(`Failed to delete physical file: ${filePath}`, fileErr);
      }
    }

    const deleted = deleteCall(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete call record.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Call deleted successfully.' });
  } catch (error: any) {
    console.error('Delete call error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete call.' }, { status: 500 });
  }
}
