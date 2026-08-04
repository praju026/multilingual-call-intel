import path from 'path';
import fs from 'fs';
import { updateCall, getCallById } from './db';
import { transcribeAudio } from './audio';
import { generateCallInsights } from './insights';
import { getUploadsDir } from './storage';

export async function processCallInsights(id: string, transcription: any): Promise<void> {
  const call = await getCallById(id);
  if (!call) return;

  try {
    // 2. Update status to analyzing
    await updateCall(id, {
      status: 'analyzing',
      duration: transcription.duration,
      transcript: transcription.transcript
    });
    console.log(`[Processing Call ${id}] Speech-to-text completed. Starting AI Insights...`);

    // 3. Generate insights
    const insights = await generateCallInsights(transcription.transcript, call.originalName);

    const languages = insights.detectedLanguages || transcription.detectedLanguages || [];

    // 4. Update status to completed
    await updateCall(id, {
      status: 'completed',
      insights: {
        summary: insights.summary,
        keyDiscussionPoints: insights.keyDiscussionPoints,
        actionItems: insights.actionItems,
        customerIntent: insights.customerIntent,
        sentiment: insights.sentiment,
        callOutcome: insights.callOutcome,
        detectedLanguages: languages,
        speakerMapping: insights.speakerMapping,
        qaScore: insights.qaScore
      }
    });

    console.log(`[Processing Call ${id}] Processing completed successfully.`);
  } catch (error: any) {
    console.error(`[Processing Call ${id}] Insights Error:`, error);
    await updateCall(id, {
      status: 'failed',
      error: error.message || 'An unknown error occurred during AI processing.'
    });
  }
}

export async function processCall(id: string): Promise<void> {
  const call = await getCallById(id);
  if (!call) {
    console.error(`Process call failed: Call ${id} not found in DB.`);
    return;
  }

  const uploadDir = getUploadsDir();
  const filePath = path.join(uploadDir, call.filename);

  const hasCloudUrl = call.audioUrl && (call.audioUrl.startsWith('http://') || call.audioUrl.startsWith('https://'));

  if (!fs.existsSync(filePath) && !hasCloudUrl) {
    const errorMsg = `Audio file not found locally or in cloud for ${call.filename}`;
    console.error(errorMsg);
    await updateCall(id, { status: 'failed', error: errorMsg });
    return;
  }

  try {
    // 1. Update status to transcribing
    await updateCall(id, { status: 'transcribing' });
    console.log(`[Processing Call ${id}] Starting speech-to-text...`);
    
    // Construct Webhook URL using Vercel environment variables first to avoid misconfigured localhost URLs
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL 
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` 
      : (process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}` 
          : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
    const webhookUrl = `${host}/api/webhooks/assemblyai?callId=${id}`;

    const transcriptionResponse = await transcribeAudio(filePath, call.language, webhookUrl, call.audioUrl);
    
    if (transcriptionResponse.type === 'webhook') {
      // Background processing continues in the webhook handler
      console.log(`[Processing Call ${id}] Handed off to webhook.`);
      return;
    }

    if (transcriptionResponse.result) {
      await processCallInsights(id, transcriptionResponse.result);
    }

  } catch (error: any) {
    console.error(`[Processing Call ${id}] Error:`, error);
    await updateCall(id, {
      status: 'failed',
      error: error.message || 'An unknown error occurred during processing.'
    });
  }
}
