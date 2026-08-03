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
  qaScore?: {
    overallScore: number;
    criteria: { name: string; score: number; maxScore: number }[];
    evidence: string[];
    coachingRecommendation: string;
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
  orgId?: string | null; // Clerk organization ID for B2B multi-tenancy
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
      ALTER TABLE calls ADD COLUMN IF NOT EXISTS org_id VARCHAR(255);
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

export async function getCalls(userId?: string, orgId?: string | null): Promise<CallRecord[]> {
  const targetUser = userId || 'guest';
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      let rows;
      if (orgId) {
        ({ rows } = await sql`
          SELECT data FROM calls WHERE org_id = ${orgId} ORDER BY created_at DESC;
        `);
      } else {
        ({ rows } = await sql`
          SELECT data FROM calls WHERE user_id = ${targetUser} AND (org_id IS NULL OR org_id = '') ORDER BY created_at DESC;
        `);
      }
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
    return allCalls.filter(c => {
      if (orgId) return c.orgId === orgId;
      return (c.userId || 'guest') === targetUser && !c.orgId;
    });
  } catch (error) {
    console.error('Error reading JSON DB:', error);
    return [];
  }
}

export async function getCallById(id: string, userId?: string, orgId?: string | null): Promise<CallRecord | undefined> {
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      let rows;
      if (orgId) {
        ({ rows } = await sql`SELECT data FROM calls WHERE id = ${id} AND org_id = ${orgId};`);
      } else if (userId) {
        ({ rows } = await sql`SELECT data FROM calls WHERE id = ${id} AND user_id = ${userId} AND (org_id IS NULL OR org_id = '');`);
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
    if (!found) return undefined;
    if (orgId) {
      if (found.orgId !== orgId) return undefined;
    } else if (userId) {
      if ((found.userId || 'guest') !== userId || found.orgId) return undefined;
    }
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
        INSERT INTO calls (id, user_id, org_id, data, created_at)
        VALUES (${record.id}, ${record.userId}, ${record.orgId || null}, ${JSON.stringify(record)}, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, org_id = EXCLUDED.org_id;
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

export async function deleteCall(id: string, userId?: string, orgId?: string | null): Promise<boolean> {
  if (hasCloudDatabase()) {
    try {
      await ensurePostgresTable();
      const { sql } = await import('@vercel/postgres');
      let result;
      if (orgId) {
        result = await sql`DELETE FROM calls WHERE id = ${id} AND org_id = ${orgId};`;
      } else if (userId) {
        result = await sql`DELETE FROM calls WHERE id = ${id} AND user_id = ${userId} AND (org_id IS NULL OR org_id = '');`;
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
    if (orgId) return call.orgId !== orgId;
    if (userId) return (call.userId || 'guest') !== userId || !!call.orgId;
    return false;
  });
  if (filtered.length === calls.length) {
    return false;
  }
  fs.writeFileSync(dbFile, JSON.stringify({ calls: filtered }, null, 2), 'utf-8');
  return true;
}
