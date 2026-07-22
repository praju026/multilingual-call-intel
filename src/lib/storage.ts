import path from 'path';
import fs from 'fs';

export function isServerlessEnvironment(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT) ||
    process.cwd().includes('/var/task')
  );
}

export function getUploadsDir(): string {
  if (isServerlessEnvironment()) {
    const tmpDir = path.join('/tmp', 'uploads');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }

  const defaultDir = path.join(process.cwd(), 'public', 'uploads');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return defaultDir;
  } catch (err) {
    // Fallback to /tmp/uploads on Vercel or read-only environments
    const tmpDir = path.join('/tmp', 'uploads');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

export function getDataDir(): string {
  if (isServerlessEnvironment()) {
    const tmpDir = path.join('/tmp', 'data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }

  const defaultDir = path.join(process.cwd(), 'data');
  try {
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }
    return defaultDir;
  } catch (err) {
    // Fallback to /tmp/data on Vercel or read-only environments
    const tmpDir = path.join('/tmp', 'data');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
  }
}

export function hasCloudBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadAudioFile(buffer: Buffer, filename: string): Promise<{ url: string; isCloud: boolean }> {
  if (hasCloudBlobStorage()) {
    try {
      const { put } = await import('@vercel/blob');
      const blob = await put(filename, buffer, { access: 'public' });
      return { url: blob.url, isCloud: true };
    } catch (err: any) {
      console.warn('[AuraIntel Storage] Vercel Blob upload failed, falling back to local filesystem:', err.message);
    }
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, buffer);
  return { url: filename, isCloud: false };
}

export async function deleteAudioFile(filenameOrUrl: string): Promise<boolean> {
  if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) {
    if (hasCloudBlobStorage()) {
      try {
        const { del } = await import('@vercel/blob');
        await del(filenameOrUrl);
        return true;
      } catch (err: any) {
        console.warn('[AuraIntel Storage] Failed to delete blob:', err.message);
        return false;
      }
    }
    return false;
  }

  const uploadsDir = getUploadsDir();
  const filePath = path.join(uploadsDir, filenameOrUrl);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
