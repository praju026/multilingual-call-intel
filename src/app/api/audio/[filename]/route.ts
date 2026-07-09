import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { getUploadsDir } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  props: { params: Promise<{ filename: string }> | { filename: string } }
) {
  try {
    const params = await props.params;
    const filename = params.filename;
    const filePath = path.join(getUploadsDir(), filename);

    if (!fs.existsSync(filePath)) {
      return new NextResponse('Audio file not found', { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return new NextResponse('Error reading audio file', { status: 500 });
  }
}
