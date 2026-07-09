import path from 'path';
import fs from 'fs';

export function isServerlessEnvironment(): boolean {
  return (
    process.env.VERCEL === '1' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.cwd().includes('/var/task')
  );
}

export function getUploadsDir(): string {
  const dir = isServerlessEnvironment()
    ? path.join('/tmp', 'uploads')
    : path.join(process.cwd(), 'public', 'uploads');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getDataDir(): string {
  const dir = isServerlessEnvironment()
    ? path.join('/tmp', 'data')
    : path.join(process.cwd(), 'data');

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
