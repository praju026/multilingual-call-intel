import path from 'path';
import fs from 'fs';
import { updateCall, getCallById } from './db';
import { transcribeAudio } from './audio';
import { generateCallInsights } from './insights';
import { getUploadsDir } from './storage';

export async function processCall(id: string): Promise<void> {
  const call = getCallById(id);
  if (!call) {
    console.error(`Process call failed: Call ${id} not found in DB.`);
    return;
  }

  const uploadDir = getUploadsDir();
  const filePath = path.join(uploadDir, call.filename);

  if (!fs.existsSync(filePath)) {
    const errorMsg = `Audio file not found at ${filePath}`;
    console.error(errorMsg);
    updateCall(id, { status: 'failed', error: errorMsg });
    return;
  }

  try {
    // 1. Update status to transcribing
    updateCall(id, { status: 'transcribing' });
    console.log(`[Processing Call ${id}] Starting speech-to-text...`);
    
    const transcription = await transcribeAudio(filePath);
    
    // 2. Update status to analyzing
    updateCall(id, {
      status: 'analyzing',
      duration: transcription.duration,
      transcript: transcription.transcript
    });
    console.log(`[Processing Call ${id}] Speech-to-text completed. Starting AI Insights...`);

    // 3. Generate insights
    const insights = await generateCallInsights(transcription.transcript, call.originalName);

    // If transcription didn't find languages but Gemini insights did, merge them
    const languages = insights.detectedLanguages || transcription.detectedLanguages || [];

    // 4. Update status to completed
    updateCall(id, {
      status: 'completed',
      insights: {
        summary: insights.summary,
        keyDiscussionPoints: insights.keyDiscussionPoints,
        actionItems: insights.actionItems,
        customerIntent: insights.customerIntent,
        sentiment: insights.sentiment,
        callOutcome: insights.callOutcome,
        detectedLanguages: languages,
        speakerMapping: insights.speakerMapping
      }
    });

    console.log(`[Processing Call ${id}] Processing completed successfully.`);
  } catch (error: any) {
    console.error(`[Processing Call ${id}] Error:`, error);
    updateCall(id, {
      status: 'failed',
      error: error.message || 'An unknown error occurred during processing.'
    });
  }
}
