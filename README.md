# AuraIntel: AI-Powered B2B Quality Assurance & Team Workspace

AuraIntel is a modern, enterprise-grade B2B web application built for Indian BPO and customer support teams. It acts as an automated AI Quality Assurance platform that ingests multilingual call recordings, transcribes them natively (with deep support for Hinglish, Tanglish, and code-switching), and scores agents on critical KPIs automatically.

## Key Features

1. **Enterprise Call Ingestion & Storage**: Supports MP3, WAV, and M4A formats with robust cloud storage via **Vercel Blob**.
2. **Multilingual Speech-to-Text**: 
   - Transcribes native regional languages (English, Hindi, Tamil, Telugu) completely verbatim.
   - Handles hybrid code-switching dialects flawlessly (e.g. speaking Hindi and English in the same sentence).
3. **Automated B2B QA Scoring & Insights**:
   - Scores agents on KPIs like Greeting, Issue Resolution, Tone, Compliance, and Next Steps.
   - Extracts actionable insights: Customer Intent, Sentiment, Call Outcome.
   - Built on a robust **Gemini Multi-Model Fallback Engine**. It automatically cycles through `gemini-1.5-flash-latest`, `gemini-1.5-pro-latest`, and `gemini-2.5-flash` to ensure zero downtime from API quota limits or model restrictions.
4. **Interactive Audio-Synced Workspace**: 
   - Clicking any utterance in the transcript seeks the audio player to that exact millisecond.
   - Acts as a "karaoke style" scroll, highlighting the active speaker in real-time.
5. **Team Workspaces & Authentication**: 
   - Secure login and team member management powered by **Clerk**.
6. **Serverless Relational Database**: 
   - State and analytics stored securely on **Neon Postgres**.

---

## Technical Stack

- **Framework**: Next.js 16.2 App Router (Turbopack)
- **Language**: TypeScript
- **Styling**: Vanilla CSS (Premium Dark Mode aesthetics, glassmorphism, fluid micro-animations)
- **Authentication**: Clerk (`@clerk/nextjs`)
- **Database**: Neon Serverless Postgres (`@neondatabase/serverless`)
- **Storage**: Vercel Blob (`@vercel/blob`)
- **AI SDK**: Google Gen AI Node SDK (`@google/genai`)
- **STT SDK**: AssemblyAI Node SDK (`assemblyai`)
- **Icons**: Lucide React (`lucide-react`)

---

## Installation & Setup

### 1. Prerequisites
- **Node.js**: `v18.x` or later
- **NPM**: `v9.x` or later

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a file named `.env.local` in the root of the project. You must supply the following keys for the B2B pipeline to work:

```env
# Google Gemini (Required for B2B QA Insights & Fallback STT)
GEMINI_API_KEY=your_gemini_api_key

# AssemblyAI (Required for Millisecond-Accurate Multilingual STT)
ASSEMBLYAI_API_KEY=your_assemblyai_api_key

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Neon Database
DATABASE_URL=your_neon_postgres_connection_string

# Vercel Blob (Must be configured as a PUBLIC store)
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

---

## Running Locally

Start the local Turbopack development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser. 

---

## Deployment to Vercel

This B2B SaaS is heavily optimized for Vercel's edge network and serverless environment.

1. Push your repository to GitHub.
2. Import the project in Vercel.
3. Attach your **Vercel Postgres (Neon)** and **Vercel Blob (Public)** stores directly in the Vercel Storage tab.
4. Ensure all other environment variables (Clerk, Gemini, AssemblyAI) are populated.
5. Click **Deploy**.

> **Important**: Ensure your Vercel Blob store is set to **Public Access** so the audio player in the client-side browser can directly stream the MP3 files.
