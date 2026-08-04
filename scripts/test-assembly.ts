import { AssemblyAI } from 'assemblyai';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY as string });
  
  const audioUrl = 'https://audio-samples.github.io/samples/mp3/blizzard_unconditional/sample-0.mp3';
  
  const params: any = {
    audio: audioUrl,
    speaker_labels: true,
    language_code: 'en'
  };

  try {
    console.log('Testing .transcribe()...');
    const t1 = await client.transcripts.transcribe(params);
    console.log('Transcribe success:', t1.id);
  } catch (e: any) {
    console.error('Transcribe error:', e.message);
  }

  try {
    console.log('Testing .submit()...');
    const t2 = await client.transcripts.submit(params);
    console.log('Submit success:', t2.id);
  } catch (e: any) {
    console.error('Submit error:', e.message);
  }

  try {
    console.log('Testing .submit() with audio_url...');
    const p3 = { ...params };
    delete p3.audio;
    p3.audio_url = audioUrl;
    const t3 = await client.transcripts.submit(p3);
    console.log('Submit audio_url success:', t3.id);
  } catch (e: any) {
    console.error('Submit audio_url error:', e.message);
  }
}

main().catch(console.error);
