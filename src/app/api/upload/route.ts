import { NextResponse, after } from 'next/server';
import path from 'path';
import fs from 'fs';
import { createCall } from '@/lib/db';
import { processCall } from '@/lib/process';
import { getUploadsDir, isServerlessEnvironment, uploadAudioFile } from '@/lib/storage';
import { getAuthSession } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby max limit
export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthSession();
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const chunkIndexStr = formData.get('chunkIndex') as string | null;
    const totalChunksStr = formData.get('totalChunks') as string | null;
    const uploadId = formData.get('uploadId') as string | null;
    const originalNameParam = formData.get('originalName') as string | null;
    const languageParam = formData.get('language') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const uploadDir = getUploadsDir();

    // Check if this is a chunked upload
    const totalChunks = totalChunksStr ? parseInt(totalChunksStr, 10) : 1;
    const chunkIndex = chunkIndexStr ? parseInt(chunkIndexStr, 10) : 0;

    if (totalChunks > 1 && uploadId) {
      // 1. Save individual chunk
      const partPath = path.join(uploadDir, `${uploadId}.part_${chunkIndex}`);
      fs.writeFileSync(partPath, buffer);

      // 2. If not the last chunk, acknowledge receipt
      if (chunkIndex < totalChunks - 1) {
        return NextResponse.json({ success: true, chunkUploaded: true, chunkIndex });
      }

      // 3. Last chunk received: reassemble all parts into the complete audio file
      const originalName = originalNameParam || file.name || 'audio.mp3';
      const ext = path.extname(originalName) || '.mp3';
      const id = uploadId;
      const filename = `${id}${ext}`;
      const finalFilePath = path.join(uploadDir, filename);

      const writeStream = fs.createWriteStream(finalFilePath);
      for (let i = 0; i < totalChunks; i++) {
        const pPath = path.join(uploadDir, `${uploadId}.part_${i}`);
        if (fs.existsSync(pPath)) {
          const chunkBuffer = fs.readFileSync(pPath);
          writeStream.write(chunkBuffer);
          try {
            fs.unlinkSync(pPath);
          } catch {}
        }
      }
      writeStream.end();

      // Wait for write stream to finish
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Upload reassembled file to cloud or keep local
      const reassembledBuffer = fs.readFileSync(finalFilePath);
      const { url: audioUrl, isCloud } = await uploadAudioFile(reassembledBuffer, filename);
      if (isCloud && fs.existsSync(finalFilePath)) {
        try { fs.unlinkSync(finalFilePath); } catch {}
      }

      const newCall = await createCall({
        id,
        filename,
        originalName,
        duration: 0,
        status: 'queued',
        createdAt: new Date().toISOString(),
        userId,
        orgId,
        audioUrl,
        isCloud,
        language: languageParam || 'auto',
      });

      // Run processCall synchronously since Webhooks make it return immediately
      try {
        await processCall(id);
      } catch (err) {
        console.error(`Processing for call ${id} failed:`, err);
      }

      return NextResponse.json({ success: true, call: newCall });
    }

    // Standard single-request upload for small files (<= 3.5 MB)
    const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.name) || '.mp3';
    const filename = `${id}${ext}`;

    const { url: audioUrl, isCloud } = await uploadAudioFile(buffer, filename);

    const newCall = await createCall({
      id,
      filename,
      originalName: file.name,
      duration: 0,
      status: 'queued',
      createdAt: new Date().toISOString(),
      userId,
      orgId,
      audioUrl,
      isCloud,
      language: languageParam || 'auto',
    });

    // Run processCall synchronously since Webhooks make it return immediately
    try {
      await processCall(id);
    } catch (err) {
      console.error(`Processing for call ${id} failed:`, err);
    }

    return NextResponse.json({ success: true, call: newCall });
  } catch (error: any) {
    console.error('Upload API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload file.' },
      { status: 500 }
    );
  }
}
