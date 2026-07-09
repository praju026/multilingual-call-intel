import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createCall } from '@/lib/db';
import { processCall } from '@/lib/process';
import { getUploadsDir, isServerlessEnvironment } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create unique ID and filenames
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.name) || '.mp3';
    const filename = `${id}${ext}`;

    const uploadDir = getUploadsDir();
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    // Save call as queued in the database
    const newCall = createCall({
      id,
      filename,
      originalName: file.name,
      duration: 0,
      status: 'queued',
      createdAt: new Date().toISOString(),
    });

    // Start processing
    if (isServerlessEnvironment()) {
      // In serverless / Vercel Lambda, await processing so the container doesn't freeze mid-flight
      await processCall(id).catch(err => {
        console.error(`Processing for call ${id} failed:`, err);
      });
    } else {
      processCall(id).catch(err => {
        console.error(`Background processing for call ${id} failed:`, err);
      });
    }

    return NextResponse.json({ success: true, call: newCall });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to upload file.' }, { status: 500 });
  }
}
