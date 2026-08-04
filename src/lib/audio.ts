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

export interface TranscriptionResponse {
  type: 'sync' | 'webhook';
  result?: TranscriptionResult;
  transcriptId?: string;
}

export async function transcribeAudio(
  filePath: string, 
  language: string = 'auto', 
  webhookUrl?: string,
  audioUrl?: string
): Promise<TranscriptionResponse> {
  const assemblyKey = process.env.ASSEMBLYAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!assemblyKey && !geminiKey) {
    console.log('[AuraIntel STT] No API keys configured. Using Mock Multilingual STT Fallback.');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate processing latency
    
    return {
      type: 'sync',
      result: {
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
      }
    };
  }

  let fileDurationSec = 0;

  if (assemblyKey) {
    try {
      console.log('Starting AssemblyAI transcription...');
      const client = new AssemblyAI({ apiKey: assemblyKey });
      
      const transcribeParams: any = {
        speaker_labels: true,
      };

      if (audioUrl && (audioUrl.startsWith('http://') || audioUrl.startsWith('https://'))) {
        transcribeParams.audio_url = audioUrl;
      } else {
        transcribeParams.audio = filePath;
      }

      if (language && language !== 'auto') {
        transcribeParams.language_code = language;
      } else {
        transcribeParams.language_detection = true;
      }

      if (webhookUrl) {
        transcribeParams.webhook_url = webhookUrl;
        console.log(`Submitting to AssemblyAI with webhook: ${webhookUrl}`);
        const transcript = await client.transcripts.submit(transcribeParams);
        return { type: 'webhook', transcriptId: transcript.id };
      } else {
        const transcript = await client.transcripts.transcribe(transcribeParams);

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
          type: 'sync',
          result: {
            transcript: turns,
            detectedLanguages,
            duration: fileDurationSec
          }
        };
      }
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
    
    let fileBuffer: Buffer;
    if (fs.existsSync(filePath)) {
      fileBuffer = fs.readFileSync(filePath);
    } else if (audioUrl && (audioUrl.startsWith('http://') || audioUrl.startsWith('https://'))) {
      console.log(`[AuraIntel STT] Downloading audio from cloud for Gemini fallback...`);
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error(`Failed to download audio for Gemini: ${response.statusText}`);
      fileBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error(`Audio file not found locally or in cloud for Gemini fallback.`);
    }

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

    // Map ISO language code to full language name to help Gemini understand the target script
    const langMap: Record<string, string> = {
      'en': 'English', 'hi': 'Hindi', 'ta': 'Tamil', 'te': 'Telugu', 'ml': 'Malayalam', 'kn': 'Kannada'
    };
    const fullLangName = (language && language !== 'auto') ? (langMap[language] || language) : null;

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
              text: { type: 'STRING', description: 'Transcribed text of the utterance in the native script of the spoken language' },
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
      let attempts2 = 0;
      while (attempts2 < 3) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                fileData: {
                  fileUri: uploadResult.uri,
                  mimeType: uploadResult.mimeType
                }
              },
              `You are an expert audio transcription system. Transcribe the EXACT spoken words verbatim from the audio recording in their NATIVE script.
${fullLangName ? `\nCRITICAL: The primary language spoken in this audio is "${fullLangName}". You MUST transcribe strictly in the native ${fullLangName} script when they speak ${fullLangName}.` : ''}
CRITICAL RULES:
1. NEVER TRANSLATE. If the speaker speaks ${fullLangName || 'a regional language'}, transcribe it EXACTLY in the ${fullLangName || 'native'} alphabet/script. Do NOT translate it to English.
2. If the speakers speak purely in English (even with an Indian accent), transcribe the text strictly in English.
3. DO NOT transliterate English words into Devanagari (Hindi) or regional scripts. If a word is English, write it in the English alphabet (e.g., write "Hello", NOT "हेलो", write "Speaking", NOT "स्पीकिंग").
4. If they mix languages (code-switching), use the native script for the regional words and English script for the English words.
5. Names of people, places, or companies MUST be written in English alphabet when spoken in an English context.
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
          attempts2++;
          console.warn(`[AuraIntel STT] Gemini API attempt ${attempts2} failed: ${err.message}. ${attempts2 < 3 ? 'Retrying...' : ''}`);
          if (attempts2 >= 3) throw err;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts2));
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
        type: 'sync',
        result: {
          transcript: result.turns || [],
          detectedLanguages: result.detectedLanguages || [],
          duration: fileDurationSec
        }
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
