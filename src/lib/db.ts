import fs from 'fs';
import path from 'path';
import { getDataDir } from './storage';

export interface ActionItem {
  task: string;
  assignee: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface TranscriptTurn {
  speaker: string;
  startTime: string; // MM:SS or seconds
  endTime: string;
  text: string;
  language?: string;
}

export interface CallInsights {
  summary: string;
  keyDiscussionPoints: string[];
  actionItems: ActionItem[];
  customerIntent: string;
  sentiment: 'positive' | 'neutral' | 'negative' | string;
  callOutcome: string;
  detectedLanguages: string[];
  speakerMapping?: {
    agent: string;
    customer: string;
  };
}

export interface CallRecord {
  id: string;
  filename: string;
  originalName: string;
  duration: number; // in seconds, default 0 initially
  status: 'uploading' | 'queued' | 'transcribing' | 'analyzing' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  transcript?: TranscriptTurn[];
  insights?: CallInsights;
  userId?: string; // Clerk user ID or 'guest'
  audioUrl?: string; // Vercel Blob URL or local filename
  isCloud?: boolean;
  language?: string; // e.g., 'en', 'hi', 'te', 'ta', 'auto'
}

export function hasCloudDatabase(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);
}

async function ensurePostgresTable() {
  if (!hasCloudDatabase()) return;
  try {
    const { sql } = await import('@vercel/postgres');
    await sql`
      CREATE TABLE IF NOT EXISTS calls (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  } catch (err: any) {
    console.warn('[AuraIntel DB] Postgres table check failed:', err.message);
  }
}

function getDbFile(): string {
  const dbDir = getDataDir();
  const dbFile = path.join(dbDir, 'db.json');
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify({ calls: [] }, null, 2), 'utf-8');
  }
  return dbFile;
}

export async function getCalls(userId?: string): Promise<CallRecord[]> {
  const targetUser = userId || 'guest';
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      const { rows } = await sql`
        SELECT data FROM calls WHERE user_id = ${targetUser} ORDER BY created_at DESC;
      `;
      return rows.map(r => r.data as CallRecord);
    } catch (err: any) {
      console.warn('[AuraIntel DB] Postgres getCalls failed, falling back to local JSON:', err.message);
    }
  }

  // Local JSON fallback
  const dbFile = getDbFile();
  try {
    const data = fs.readFileSync(dbFile, 'utf-8');
    const parsed = JSON.parse(data);
    const allCalls: CallRecord[] = parsed.calls || [];
    return allCalls.filter(c => (c.userId || 'guest') === targetUser);
  } catch (error) {
    console.error('Error reading JSON DB:', error);
    return [];
  }
}

export async function getCallById(id: string, userId?: string): Promise<CallRecord | undefined> {
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      let rows;
      if (userId) {
        ({ rows } = await sql`SELECT data FROM calls WHERE id = ${id} AND user_id = ${userId};`);
      } else {
        ({ rows } = await sql`SELECT data FROM calls WHERE id = ${id};`);
      }
      if (rows && rows.length > 0) return rows[0].data as CallRecord;
      return undefined;
    } catch (err: any) {
      console.warn('[AuraIntel DB] Postgres getCallById failed, falling back to local JSON:', err.message);
    }
  }

  // Local JSON fallback
  const dbFile = getDbFile();
  try {
    const data = fs.readFileSync(dbFile, 'utf-8');
    const parsed = JSON.parse(data);
    const allCalls: CallRecord[] = parsed.calls || [];
    const found = allCalls.find(call => call.id === id);
    if (found && userId && (found.userId || 'guest') !== userId) return undefined;
    return found;
  } catch (error) {
    return undefined;
  }
}

export async function createCall(call: CallRecord): Promise<CallRecord> {
  const record = { ...call, userId: call.userId || 'guest' };
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      await sql`
        INSERT INTO calls (id, user_id, data, created_at)
        VALUES (${record.id}, ${record.userId}, ${JSON.stringify(record)}, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
      `;
      return record;
    } catch (err: any) {
      console.warn('[AuraIntel DB] Postgres createCall failed, falling back to local JSON:', err.message);
    }
  }

  const dbFile = getDbFile();
  let calls: CallRecord[] = [];
  try {
    calls = JSON.parse(fs.readFileSync(dbFile, 'utf-8')).calls || [];
  } catch {}
  calls.unshift(record);
  fs.writeFileSync(dbFile, JSON.stringify({ calls }, null, 2), 'utf-8');
  return record;
}

export async function updateCall(id: string, updates: Partial<CallRecord>): Promise<CallRecord> {
  const existing = await getCallById(id);
  if (!existing) {
    throw new Error(`Call with ID ${id} not found.`);
  }
  const updatedCall = { ...existing, ...updates };

  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      await sql`
        UPDATE calls SET data = ${JSON.stringify(updatedCall)} WHERE id = ${id};
      `;
      return updatedCall;
    } catch (err: any) {
      console.warn('[AuraIntel DB] Postgres updateCall failed, falling back to local JSON:', err.message);
    }
  }

  const dbFile = getDbFile();
  let calls: CallRecord[] = [];
  try {
    calls = JSON.parse(fs.readFileSync(dbFile, 'utf-8')).calls || [];
  } catch {}
  const index = calls.findIndex(call => call.id === id);
  if (index !== -1) {
    calls[index] = updatedCall;
    fs.writeFileSync(dbFile, JSON.stringify({ calls }, null, 2), 'utf-8');
  }
  return updatedCall;
}

export async function deleteCall(id: string, userId?: string): Promise<boolean> {
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      let result;
      if (userId) {
        result = await sql`DELETE FROM calls WHERE id = ${id} AND user_id = ${userId};`;
      } else {
        result = await sql`DELETE FROM calls WHERE id = ${id};`;
      }
      return (result.rowCount ?? 0) > 0;
    } catch (err: any) {
      console.warn('[AuraIntel DB] Postgres deleteCall failed, falling back to local JSON:', err.message);
    }
  }

  const dbFile = getDbFile();
  let calls: CallRecord[] = [];
  try {
    calls = JSON.parse(fs.readFileSync(dbFile, 'utf-8')).calls || [];
  } catch {}
  const filtered = calls.filter(call => {
    if (call.id !== id) return true;
    if (userId && (call.userId || 'guest') !== userId) return true;
    return false;
  });
  if (filtered.length === calls.length) {
    return false;
  }
  fs.writeFileSync(dbFile, JSON.stringify({ calls: filtered }, null, 2), 'utf-8');
  return true;
}
