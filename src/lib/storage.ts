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
