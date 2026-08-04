const { AssemblyAI } = require('assemblyai');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = env.match(/ASSEMBLYAI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;
const audioUrl = 'https://audio-samples.github.io/samples/mp3/blizzard_unconditional/sample-0.mp3';

async function main() {
  const client = new AssemblyAI({ apiKey });
  try {
    const transcript = await client.transcripts.submit({
      audio_url: audioUrl,
      language_code: 'en'
    });
    console.log('SUCCESS:', transcript.id);
  } catch (err) {
    console.error('ERROR NAME:', err.name);
    console.error('ERROR MESSAGE:', err.message);
    if (err.cause) {
      console.error('ERROR CAUSE:', err.cause);
    }
    console.error('ERROR STACK:', err.stack);
  }
}
main();
