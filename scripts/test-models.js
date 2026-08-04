const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const apiKeyMatch = env.match(/GEMINI_API_KEY=(.*)/);
const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

async function main() {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.list();
  for await (const model of response) {
    if (model.name.includes('flash')) {
      console.log(model.name);
    }
  }
}
main().catch(console.error);
