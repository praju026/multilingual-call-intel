# 🗝️ Guide: Setting Up API Keys for AuraIntel

AuraIntel Call Intelligence Platform uses cutting-edge AI models to transcribe multilingual audio calls, perform speaker diarization, generate executive summaries, and extract actionable insights.

> [!IMPORTANT]
> **Mock vs. Real AI Mode**: If no API keys are configured, the platform automatically runs in **Mock/Demo Fallback Mode**, returning predetermined sample data for testing UI layouts. To enable live AI transcription and analysis on your uploaded audio files, you must configure your API keys as detailed below.

---

## 📋 Step 1: Obtain Your API Keys

You will need at least a **Gemini API Key** to enable live AI processing. For professional-grade speech-to-text accuracy and timestamps, an **AssemblyAI API Key** is also highly recommended.

### 1. Google Gemini API Key (Required)
Used for generating executive call summaries, sentiment analysis, action item extraction, customer intent detection, and fallback audio transcription.
* **Cost**: Free tier available with generous limits.
* **How to get it**:
  1. Go to **[Google AI Studio](https://aistudio.google.com/)**.
  2. Sign in with your Google account.
  3. Click **"Get API key"** -> **"Create API key"**.
  4. Copy the generated key (e.g., `AIzaSy...`).

### 2. AssemblyAI API Key (Recommended)
Used as the primary speech-to-text (STT) engine for high-accuracy multilingual transcription, word-level timestamps, and speaker diarization (Speaker A / Speaker B differentiation).
* **Cost**: Free trial credit available upon signup.
* **How to get it**:
  1. Go to **[AssemblyAI](https://www.assemblyai.com/)** and create an account.
  2. Navigate to your dashboard.
  3. Copy your **API Key** from the right-hand panel (e.g., `ea7dbb3d...`).

---

## 🛠️ Step 2: Create the `.env.local` File

1. Navigate to the **root directory** of your project (where `package.json` is located).
2. Create a new file named exactly **`.env.local`** (note the leading dot).
3. Copy and paste the following template into your `.env.local` file, replacing the placeholder values with your actual API keys:

```env
# ==========================================
# 🧠 Google Gemini API (Required)
# ==========================================
# Powers AI Insights, Summaries, Action Items, and Fallback STT
GEMINI_API_KEY=your_actual_gemini_api_key_here

# ==========================================
# 🎙️ AssemblyAI API (Recommended)
# ==========================================
# Powers primary Speech-to-Text, Diarization, and Timestamps
# Note: If omitted or if network timeouts occur, the app automatically falls back to Gemini STT.
ASSEMBLYAI_API_KEY=your_actual_assemblyai_api_key_here

# ==========================================
# 🔐 Clerk Authentication (Optional - Multi-User Login)
# ==========================================
# Enables multi-user sign in, sign up, and private account isolation.
# Note: If omitted, the app runs in Local Offline Mode as 'guest'.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# ==========================================
# ☁️ Vercel Blob Cloud Storage (Optional - Permanent Audio Storage)
# ==========================================
# Persists audio files across serverless container restarts.
# Note: If omitted, uploads default to local filesystem (/tmp or public/uploads).
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# ==========================================
# 🗄️ Vercel Postgres / Neon Database (Optional - SQL Storage)
# ==========================================
# Stores call metadata and insights permanently in PostgreSQL.
# Note: If omitted, records fall back to local data/db.json file.
POSTGRES_URL=your_postgres_connection_string

# ==========================================
# 🌐 Network Reliability & Best Practices
# ==========================================
# Prevents Node.js IPv6 socket drops ("UND_ERR_SOCKET: other side closed") when communicating with AI APIs
NODE_OPTIONS=--dns-result-order=ipv4first
```

---

## 🛡️ Step 3: Security & Verification

> [!TIP]
> **Your keys are secure by default**: The project's `.gitignore` file contains a rule for `.env*`. This guarantees that your `.env.local` file will **never** be tracked by Git or committed to public GitHub repositories.

### To verify your keys are active:
1. Whenever you create or modify `.env.local`, you **must restart your local development or production server**:
   ```bash
   # Stop the running server (Press Ctrl + C)
   # Then restart in development mode:
   npm run dev

   # OR restart in production mode:
   npm start
   ```
2. Look at your terminal startup logs. When an audio file is uploaded and processed, you should see real-time logging:
   * `Starting AssemblyAI transcription...` (or `Starting Gemini API transcription fallback...`)
   * `[Processing Call <id>] Speech-to-text completed. Starting AI Insights...`
   * `[Processing Call <id>] Processing completed successfully.`
3. Visit `http://localhost:3000` to view your live, dynamically generated AI insights!
