import { GoogleGenAI } from '@google/genai';
import { AssemblyAI } from 'assemblyai';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { TranscriptTurn } from './db';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/x-m4a';
    default: return 'audio/mpeg';
  }
}

function formatMsToMmSs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export interface TranscriptionResult {
  transcript: TranscriptTurn[];
  detectedLanguages: string[];
  duration: number; // in seconds
}

export async function transcribeAudio(filePath: string): Promise<TranscriptionResult> {
  const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!assemblyKey && !geminiKey) {
    console.log('[AuraIntel STT] No API keys configured. Using Mock Multilingual STT Fallback.');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate processing latency
    
    return {
      transcript: [
        { speaker: "Speaker A", startTime: "00:00", endTime: "00:06", text: "Thank you for calling Aura Support. Mera naam Rahul hai. How can I help you today?", language: "en" },
        { speaker: "Speaker B", startTime: "00:07", endTime: "00:15", text: "Hi Rahul. Maine last week subscription plan change kiya tha, but mujhe double charge ho gaya hai. Can you check please?", language: "hi" },
        { speaker: "Speaker A", startTime: "00:16", endTime: "00:21", text: "Sure, let me check the account details. Kya aap mujhe apna customer ID batayenge?", language: "hi" },
        { speaker: "Speaker B", startTime: "00:22", endTime: "00:28", text: "Yes, it is user-9482. Main bahut preshan hoon kyunki payment double deduct ho gayi.", language: "hi" },
        { speaker: "Speaker A", startTime: "00:29", endTime: "00:36", text: "Aap bilkul chinta mat kijiye. I can see the transaction duplicate charge. Hum ise immediate refund process kar rahe hain.", language: "hi" },
        { speaker: "Speaker B", startTime: "00:37", endTime: "00:41", text: "Thank you, kitna time lagega refund aane mein?", language: "hi" },
        { speaker: "Speaker A", startTime: "00:42", endTime: "00:47", text: "Refund will be credited to your account in 3 to 5 business days. Aur koi sahayata?", language: "en" },
        { speaker: "Speaker B", startTime: "00:48", endTime: "00:52", text: "Nahi, bas yahi issue tha. Dhanyawad, Rahul!", language: "hi" },
        { speaker: "Speaker A", startTime: "00:53", endTime: "00:58", text: "Thank you for calling us. Have a great day ahead!", language: "en" }
      ],
      detectedLanguages: ["en", "hi"],
      duration: 58
    };
  }

  // Determine file duration (approximation fallback if needed)
  let fileDurationSec = 0;

  if (assemblyKey) {
    try {
      console.log('Starting AssemblyAI transcription...');
      const client = new AssemblyAI({ apiKey: assemblyKey });
      
      const transcript = await client.transcripts.transcribe({
        audio: filePath,
        speaker_labels: true,
        language_detection: true,
      });

      if (transcript.status === 'error') {
        throw new Error(`AssemblyAI Error: ${transcript.error}`);
      }

      fileDurationSec = transcript.audio_duration ? Math.round(transcript.audio_duration) : 0;

      const turns: TranscriptTurn[] = [];
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

      return {
        transcript: turns,
        detectedLanguages,
        duration: fileDurationSec
      };
    } catch (err: any) {
      console.warn(`[AuraIntel STT] AssemblyAI transcription failed (${err.message}). Falling back to Gemini API...`);
    }
  }

  if (geminiKey) {
    console.log('Starting Gemini API transcription fallback...');
    // Fallback: Use Gemini direct audio understanding
    const ai = new GoogleGenAI({ apiKey: geminiKey! });
    const mimeType = getMimeType(filePath);

    // Upload using Files API
    console.log(`Uploading ${path.basename(filePath)} to Gemini Files API (${mimeType})...`);
    const fileBuffer = fs.readFileSync(filePath);
    const fileBlob = new Blob([fileBuffer], { type: mimeType });
    const uploadResult = await ai.files.upload({
      file: fileBlob,
      config: {
        mimeType,
      }
    });

    if (!uploadResult.name) {
      throw new Error('Upload failed: Gemini Files API did not return a file name.');
    }

    console.log(`Uploaded file as: ${uploadResult.name}. Waiting for file to be ACTIVE...`);

    // Poll file status until ACTIVE
    let fileState = await ai.files.get({ name: uploadResult.name });
    let attempts = 0;
    while (fileState.state === 'PROCESSING' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      fileState = await ai.files.get({ name: uploadResult.name });
      attempts++;
    }

    if (fileState.state !== 'ACTIVE') {
      // Cleanup file in case of failure
      try { await ai.files.delete({ name: uploadResult.name }); } catch {}
      throw new Error(`Gemini Files API processing failed. File state: ${fileState.state}`);
    }

    console.log('File is ACTIVE. Transcribing...');

    const responseSchema = {
      type: 'OBJECT',
      properties: {
        detectedLanguages: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'Languages detected in the audio file'
        },
        turns: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              speaker: { type: 'STRING', description: 'Speaker identifier, e.g. Speaker A, Speaker B' },
              startTime: { type: 'STRING', description: 'Start time of utterance in MM:SS format' },
              endTime: { type: 'STRING', description: 'End time of utterance in MM:SS format' },
              text: { type: 'STRING', description: 'Transcribed text of the utterance' },
              language: { type: 'STRING', description: 'Language of this specific utterance if code-switching' }
            },
            required: ['speaker', 'startTime', 'endTime', 'text']
          }
        }
      },
      required: ['detectedLanguages', 'turns']
    };

    try {
      let response;
      let attempts = 0;
      while (attempts < 3) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              uploadResult,
              `You are an expert audio transcription system. Transcribe the EXACT spoken words verbatim from the audio recording.
CRITICAL RULES:
1. NEVER translate the speech. Transcribe strictly in the exact language actually spoken.
2. If the speakers speak purely in English (even with an Indian or regional accent), transcribe the text strictly in English.
3. DO NOT transliterate English words into Devanagari (Hindi) or regional scripts. If a word is English, write it in the English alphabet (e.g., write "Hello", NOT "हेलो", write "Speaking", NOT "स्पीकिंग").
4. Names of people, places, or companies (e.g., "Prajwal", "Bangalore", "Vibri") MUST be written in English alphabet when spoken in an English context.
5. Only use Hindi, Telugu, Tamil, or regional scripts if the speaker actually speaks those exact regional words (code-switching).
6. Differentiate speakers clearly (Speaker A, Speaker B, etc.).
7. Estimate accurate start and end timestamps for each utterance in MM:SS format.
8. Provide the output strictly matching the provided JSON schema.`
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: responseSchema as any
            }
          });
          break;
        } catch (err: any) {
          attempts++;
          console.warn(`[AuraIntel STT] Gemini API attempt ${attempts} failed: ${err.message}. ${attempts < 3 ? 'Retrying...' : ''}`);
          if (attempts >= 3) throw err;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        }
      }

      const responseText = response?.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }

      const result = JSON.parse(responseText);

      // Estimate file duration from last turn's end time
      if (result.turns && result.turns.length > 0) {
        const lastTurn = result.turns[result.turns.length - 1];
        const parts = lastTurn.endTime.split(':');
        if (parts.length === 2) {
          fileDurationSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }

      return {
        transcript: result.turns || [],
        detectedLanguages: result.detectedLanguages || [],
        duration: fileDurationSec
      };
    } finally {
      // Cleanup the uploaded file from Gemini storage to be clean
      try {
        console.log(`Cleaning up file ${uploadResult.name} from Gemini...`);
        await ai.files.delete({ name: uploadResult.name });
      } catch (e) {
        console.error('Failed to delete Gemini file:', e);
      }
    }
  }

  throw new Error('All speech-to-text transcription methods failed.');
}
