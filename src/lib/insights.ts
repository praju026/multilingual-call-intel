import { GoogleGenAI } from '@google/genai';
import dns from 'dns';
import { TranscriptTurn, CallInsights } from './db';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

export interface CallInsightsWithMapping extends CallInsights {
  speakerMapping: {
    agent: string;
    customer: string;
  };
}

export async function generateCallInsights(
  transcript: TranscriptTurn[],
  filename: string
): Promise<CallInsightsWithMapping> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    console.log('[AuraIntel Insights] No API keys configured. Using Mock Insights Fallback.');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing latency
    
    return {
      summary: "Customer called regarding a double charge billing issue after upgrading their subscription plan last week. The agent verified the duplicate transaction details and initiated a refund process, which will be credited within 3-5 business days.",
      keyDiscussionPoints: [
        "Customer reported a billing discrepancy and duplicate debit.",
        "Agent verified the customer account using customer ID user-9482.",
        "Agent confirmed the double debit error and initiated a billing refund.",
        "Refund processing timeline was explained (3-5 business days)."
      ],
      actionItems: [
        { task: "Process billing refund of the duplicate transaction", assignee: "Agent", urgency: "high" },
        { task: "Verify bank statement in 3-5 business days for credit", assignee: "Customer", urgency: "medium" }
      ],
      customerIntent: "Billing Dispute & Refund Request",
      sentiment: "Mixed / Resolved",
      callOutcome: "Complaint Resolved & Refund Initiated",
      detectedLanguages: ["English", "Hindi"],
      speakerMapping: {
        agent: "Speaker A",
        customer: "Speaker B"
      },
      qaScore: {
        overallScore: 78,
        criteria: [
          { name: "Politeness & Empathy", score: 18, maxScore: 20 },
          { name: "Script Adherence", score: 16, maxScore: 20 },
          { name: "Objection Handling", score: 20, maxScore: 30 },
          { name: "Resolution", score: 24, maxScore: 30 }
        ],
        evidence: [
          "[01:15 - 01:20] - Agent politely verified account details.",
          "[03:42 - 03:50] - Agent failed to explain alternative solutions clearly when customer objected to timeline."
        ],
        coachingRecommendation: "Practice providing clear alternative timelines when a customer expresses frustration over a delay."
      }
    };
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // Format transcript turns for the prompt
  const formattedTranscript = transcript
    .map(turn => `[${turn.startTime} - ${turn.endTime}] ${turn.speaker}: ${turn.text}`)
    .join('\n');

  const prompt = `
You are an expert Call Intelligence AI and Quality Assurance Manager. Your task is to analyze the following customer support/sales call transcript and generate structured insights and an objective Agent QA Score.

First, read the transcript and identify:
1. Who is the "Agent" (representing the company, sales, support) and who is the "Customer" (the client calling in).
2. The overall summary of the call.
3. Key discussion points.
4. Action items with assignees (Agent, Customer, or a specific name) and urgency level (low, medium, high).
5. Customer's core intent (why they called, what they want).
6. Sentiment of the call (positive, neutral, negative, mixed).
7. Outcome classification (e.g. closed sale, follow-up scheduled, problem resolved, complaint unresolved, inquiry).
8. Detected languages, including code-switching (e.g. English, Hindi, Telugu, Tamil).

QUALITY ASSURANCE GRADING:
Act as a strict QA Analyst. Grade the Agent out of 100 on the following criteria:
- Politeness & Empathy (Max 20)
- Script Adherence & Professionalism (Max 20)
- Objection Handling (Max 30)
- Resolution & Product Knowledge (Max 30)

Provide a detailed QA Score object with:
- overallScore: The sum of the sub-scores (0-100).
- criteria: Array of the 4 criteria listed above with their scores.
- evidence: Extract 2-3 specific quotes from the transcript (including timestamps) that justify the score (e.g., "[01:23 - 01:28] - Agent interrupted the customer.").
- coachingRecommendation: A one-sentence actionable coaching tip for the manager to give the agent.

Transcript:
${formattedTranscript}

Please return the results in the exact JSON schema requested.
`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      summary: {
        type: 'STRING',
        description: 'A detailed summary of the conversation.'
      },
      keyDiscussionPoints: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'Main topics discussed during the call.'
      },
      actionItems: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            task: { type: 'STRING', description: 'The task/action item.' },
            assignee: { type: 'STRING', description: 'Who is responsible (e.g., Agent, Customer).' },
            urgency: { type: 'STRING', enum: ['low', 'medium', 'high'] }
          },
          required: ['task', 'assignee', 'urgency']
        },
        description: 'Action items identified in the conversation.'
      },
      customerIntent: {
        type: 'STRING',
        description: 'The primary purpose or goal of the customer.'
      },
      sentiment: {
        type: 'STRING',
        description: 'Overall sentiment of the conversation: positive, neutral, negative, or mixed.'
      },
      callOutcome: {
        type: 'STRING',
        description: 'The final status or result of the call (e.g., "Sale Closed", "Follow-up Scheduled", "Complaint Resolved", "Inquiry Only").'
      },
      detectedLanguages: {
        type: 'ARRAY',
        items: { type: 'STRING' },
        description: 'All languages detected in the transcript, including code-switching (e.g., English, Hindi, Telugu, Tamil).'
      },
      speakerMapping: {
        type: 'OBJECT',
        properties: {
          agent: { type: 'STRING', description: 'The speaker label representing the agent (e.g., Speaker A).' },
          customer: { type: 'STRING', description: 'The speaker label representing the customer (e.g., Speaker B).' }
        },
        required: ['agent', 'customer']
      },
      qaScore: {
        type: 'OBJECT',
        properties: {
          overallScore: { type: 'INTEGER', description: 'Total score out of 100.' },
          criteria: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                score: { type: 'INTEGER' },
                maxScore: { type: 'INTEGER' }
              },
              required: ['name', 'score', 'maxScore']
            }
          },
          evidence: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'Timestamped quotes from the transcript justifying the score.'
          },
          coachingRecommendation: { type: 'STRING', description: 'One-sentence coaching tip.' }
        },
        required: ['overallScore', 'criteria', 'evidence', 'coachingRecommendation']
      }
    },
    required: [
      'summary',
      'keyDiscussionPoints',
      'actionItems',
      'customerIntent',
      'sentiment',
      'callOutcome',
      'detectedLanguages',
      'speakerMapping',
      'qaScore'
    ]
  };

  let response;
  let attempts = 0;
  while (attempts < 3) {
    try {
      response = await ai.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any
        }
      });
      break;
    } catch (err: any) {
      attempts++;
      console.warn(`[AuraIntel Insights] Gemini API attempt ${attempts} failed: ${err.message}. ${attempts < 3 ? 'Retrying...' : ''}`);
      if (attempts >= 3) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
    }
  }

  const responseText = response?.text;
  if (!responseText) {
    throw new Error('Gemini insights model returned an empty response.');
  }

  const result = JSON.parse(responseText);
  return result as CallInsightsWithMapping;
}
