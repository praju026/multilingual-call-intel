import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';
import { processCallInsights } from '@/lib/process';
import { updateCall } from '@/lib/db';
import { TranscriptionResult } from '@/lib/audio';

// Helper to format ms to mm:ss
function formatMsToMmSs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const callId = searchParams.get('callId');

    if (!callId) {
      console.error('[AssemblyAI Webhook] Missing callId parameter');
      return NextResponse.json({ error: 'Missing callId' }, { status: 400 });
    }

    const payload = await req.json();
    console.log(`[AssemblyAI Webhook] Received webhook for call ${callId}`, payload);

    if (payload.status === 'completed') {
      const transcriptId = payload.transcript_id;
      
      if (!transcriptId) {
        throw new Error('No transcript_id found in completed payload');
      }

      const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
      if (!assemblyKey) {
        throw new Error('AssemblyAI key not found during webhook processing');
      }

      const client = new AssemblyAI({ apiKey: assemblyKey });
      console.log(`[AssemblyAI Webhook] Fetching transcript ${transcriptId} from AssemblyAI...`);
      const transcript = await client.transcripts.get(transcriptId);

      const fileDurationSec = transcript.audio_duration ? Math.round(transcript.audio_duration) : 0;
      const turns: any[] = [];
      
      if (transcript.utterances) {
        for (const utterance of transcript.utterances) {
          turns.push({
            speaker: `Speaker ${utterance.speaker.toUpperCase()}`,
            startTime: formatMsToMmSs(utterance.start),
            endTime: formatMsToMmSs(utterance.end),
            text: utterance.text,
            language: transcript.language_code || 'en'
          });
        }
      }

      const detectedLanguages = transcript.language_code ? [transcript.language_code] : ['en'];

      const transcriptionResult: TranscriptionResult = {
        transcript: turns,
        detectedLanguages,
        duration: fileDurationSec
      };

      // Proceed with Gemini Insights generation
      console.log(`[AssemblyAI Webhook] Triggering processCallInsights for call ${callId}`);
      
      // We don't await this so the webhook responds quickly (Vercel edge limits)
      // Actually we are in Node runtime, so if we don't await, it might get killed!
      // But webhooks have 10s default maxDuration? 
      // We should await it. We can add `export const maxDuration = 60` to this route too!
      await processCallInsights(callId, transcriptionResult);
      
      return NextResponse.json({ success: true });

    } else if (payload.status === 'error') {
      console.error(`[AssemblyAI Webhook] Transcription failed for call ${callId}:`, payload.error);
      await updateCall(callId, {
        status: 'failed',
        error: `AssemblyAI transcription failed: ${payload.error || 'Unknown error'}`
      });
      return NextResponse.json({ success: true });
    } else {
      console.log(`[AssemblyAI Webhook] Ignored status ${payload.status}`);
      return NextResponse.json({ success: true });
    }
  } catch (error: any) {
    console.error('[AssemblyAI Webhook] Error processing webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const maxDuration = 60; // Allow enough time for Gemini to run
