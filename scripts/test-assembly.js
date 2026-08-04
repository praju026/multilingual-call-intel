const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = env.match(/ASSEMBLYAI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;
const audioUrl = 'https://audio-samples.github.io/samples/mp3/blizzard_unconditional/sample-0.mp3';

async function testSubmit(payload) {
  const res = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log(payload, res.status, data.id ? 'SUCCESS' : data.error);
}

async function main() {
  if (!apiKey) {
    console.error('Missing ASSEMBLYAI_API_KEY');
    return;
  }
  await testSubmit({ audio: audioUrl, language_code: 'en' });
  await testSubmit({ audio_url: audioUrl, language_code: 'en' });
}
main();
