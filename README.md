# ⚡ AI YouTube Shorts Automation Studio

Autonomous AI Agent software that researches, scripts, voices, renders, and publishes **2 high-impact YouTube Shorts every day** about the latest AI tools, AI websites, and important breakthrough updates.

---

## 🚀 Key Features

* **Automated AI Topic Research**: Continuously harvests live tech news feeds (TechCrunch, The Verge, Ars Technica, MIT Tech Review, and developer releases) and deduplicates against previously published topics.
* **Smart Script Generation**: Generates 55–68 word hook-driven scripts strictly engineered to fit within 28 seconds (guaranteed < 30s limit for YouTube Shorts).
* **Neural Text-To-Speech (TTS)**: Multi-provider support (Free Microsoft Edge Neural TTS, OpenAI TTS, or ElevenLabs) with automatic millisecond duration measurement.
* **Vertical 9:16 Video Generation**: Automated FFmpeg compositing at 1080x1920 (30fps) with dynamic cyber motion backgrounds, glassmorphism header cards, glowing badges, and real-time progress bars.
* **Timed Synchronized Captions**: High-contrast, mobile-safe zone captions styled for viral retention.
* **Official YouTube Data API v3**: Resumable OAuth 2.0 channel uploads, custom descriptions, optimized hashtags (#Shorts), category assignment, and privacy control.
* **Cron-job.org Automation**: Secure webhook (`POST /api/cron/run`) with Bearer token authentication and daily quota enforcement (exactly 2 Shorts/day).
* **Idempotency & Crash Recovery**: State preserved in database across server restarts; automatically resumes pending uploads rather than regenerating videos.
* **Cyber Admin Dashboard**: Password-protected web interface to monitor stats, watch 9:16 video previews, inspect researched topics, adjust settings, and view live logs.
* **Dual Database Engine**: Seamless PostgreSQL (for Render production) with automatic fallback to zero-config SQLite for local development.

---

## 🛠️ Architecture & Pipeline Flow

```
+-------------------------------------------------------------------------------+
| Cron-job.org (2x Daily: 09:00 UTC & 18:00 UTC)                                |
+-------------------------------------------------------------------------------+
                                     |
                                     v
                       POST /api/cron/run (Bearer CRON_SECRET)
                                     |
                                     v
                       Check Today's Quota (e.g. 2 / day)
                                     |
                                     v
                       Automated AI News & Tool Research
                                     |
                                     v
                       Deduplicate & Select Freshest Topic
                                     |
                                     v
                       Script Generation (Hook + Info + CTA, < 68 words)
                                     |
                                     v
                       AI Voiceover Synthesis (TTS Duration Detection)
                                     |
                                     v
                       Timed Mobile Safe-Zone Captions Generation
                                     |
                                     v
                       FFmpeg 1080x1920 Vertical 9:16 Video Composition
                                     |
                                     v
                       Strict Video Validation (< 30s, MP4, H.264, AAC)
                                     |
                                     v
                       YouTube Shorts Upload via OAuth 2.0 Data API v3
                                     |
                                     v
                       Save Video ID, URL & Mark Job Completed in Database
```

---

## 📋 Prerequisites & Required APIs

1. **Node.js** (v20+ recommended)
2. **FFmpeg & FFprobe** (Installed natively on server/Render)
3. **Google Cloud Console Account** (For YouTube Data API v3 OAuth credentials)
4. **OpenAI API Key** (Optional: high-quality template engine & Edge TTS work out of the box with zero paid credits!)

---

## 🔑 Google Cloud Console & YouTube OAuth Setup

To authorize your YouTube channel for automatic uploads:

1. **Create a Google Cloud Project**:
   * Navigate to [Google Cloud Console](https://console.cloud.google.com/).
   * Click **New Project** and name it (e.g. `AI-Shorts-Automation`).
2. **Enable YouTube Data API v3**:
   * Go to **APIs & Services > Library**.
   * Search for **YouTube Data API v3** and click **Enable**.
3. **Configure OAuth Consent Screen**:
   * Go to **APIs & Services > OAuth consent screen**.
   * Select **External**, fill in App Name, Support Email, and Developer Contact.
   * Under **Scopes**, add:
     * `https://www.googleapis.com/auth/youtube.upload`
     * `https://www.googleapis.com/auth/youtube.readonly`
   * Under **Test Users**, add your YouTube channel's Google email address.
4. **Create OAuth Client ID**:
   * Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   * Application Type: **Web application**.
   * **Authorized redirect URIs**:
     * Local: `http://localhost:4000/auth/youtube/callback`
     * Production: `https://your-service-name.onrender.com/auth/youtube/callback`
   * Copy the generated **Client ID** and **Client Secret**.
5. **Connect Your Channel**:
   * Launch the application and visit `/auth/youtube` or click **Connect YouTube** in the Admin Dashboard.
   * Grant access with your YouTube channel account. The refresh token is automatically stored in your database.

---

## ⚙️ Environment Variables (`.env`)

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Web server listening port | `4000` |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `APP_URL` | Base public URL of the application | `https://your-app.onrender.com` |
| `DATABASE_URL` | PostgreSQL connection URL (leave empty for SQLite) | `postgres://user:pass@host/db` |
| `ADMIN_USERNAME` | Admin dashboard username | `admin` |
| `ADMIN_PASSWORD` | Admin dashboard password | `Admin@Secure2026!` |
| `JWT_SECRET` | Secret key for admin session cookies | Random 32+ character string |
| `CRON_SECRET` | Secret token to authenticate Cron-job.org | Random secret string |
| `DRY_RUN` | If true, renders videos without uploading to YouTube | `false` |
| `DAILY_QUOTA` | Number of Shorts to produce per day | `2` |
| `OPENAI_API_KEY` | OpenAI API key (optional) | `sk-...` |
| `TTS_PROVIDER` | TTS Engine (`edge`, `openai`, `elevenlabs`) | `edge` |
| `TTS_VOICE` | TTS voice name | `en-US-ChristopherNeural` |
| `YOUTUBE_CLIENT_ID` | Google OAuth Client ID | `xxx.apps.googleusercontent.com` |
| `YOUTUBE_CLIENT_SECRET`| Google OAuth Client Secret | `GOCSPX-xxx` |
| `YOUTUBE_REDIRECT_URI` | Google OAuth Callback URL | `${APP_URL}/auth/youtube/callback` |
| `YOUTUBE_REFRESH_TOKEN`| YouTube OAuth Refresh Token (auto-saved) | `1//xxx` |
| `STORAGE_PROVIDER` | File storage (`local` or `s3`) | `local` |

---

## 💻 Local Quickstart

```bash
# 1. Install dependencies
npm install

# 2. Configure .env
cp .env.example .env

# 3. Start the application
npm start
```

Visit `http://localhost:4000` and log in with your admin credentials.

---

## ☁️ Render Deployment Guide

1. **Push your code to GitHub**.
2. Log into [Render.com](https://dashboard.render.com/).
3. Click **New + > Blueprint** and select your GitHub repository (or choose **Web Service** with Node environment).
4. Render will read `render.yaml` and provision:
   * **Web Service**: Node.js service running `npm start`.
   * **Managed PostgreSQL Database**: Auto-linked via `DATABASE_URL`.
5. In the Render Environment tab, add your secrets:
   * `YOUTUBE_CLIENT_ID`
   * `YOUTUBE_CLIENT_SECRET`
   * `APP_URL` (e.g. `https://your-service.onrender.com`)
   * `CRON_SECRET`
6. Once deployed, test the health check:
   ```bash
   curl https://your-service.onrender.com/health
   ```
7. Visit `https://your-service.onrender.com` and click **Connect YouTube** to perform one-time OAuth channel authorization.

---

## ⏰ Cron-job.org Setup (2 Shorts per Day)

To automatically trigger the 2 daily Shorts without human intervention:

1. Create a free account at [Cron-job.org](https://cron-job.org).
2. Click **Create Cronjob**:
   * **Title**: `AI Shorts Morning Release`
   * **URL**: `https://your-service.onrender.com/api/cron/run`
   * **Request Method**: `POST`
   * **Schedule**: Daily at `09:00 UTC` (or your preferred morning hour).
   * **Headers**:
     * `Authorization`: `Bearer YOUR_CRON_SECRET`
3. Click **Create Cronjob** again for the evening release:
   * **Title**: `AI Shorts Evening Release`
   * **URL**: `https://your-service.onrender.com/api/cron/run`
   * **Request Method**: `POST`
   * **Schedule**: Daily at `18:00 UTC`.
   * **Headers**:
     * `Authorization`: `Bearer YOUR_CRON_SECRET`
4. The internal idempotency system ensures that even if Cron-job.org fires extra requests or retries, **exactly 2 Shorts** will be published per calendar day.

---

## 🧪 Testing with DRY_RUN Mode

To verify the entire pipeline (research -> script -> audio -> captions -> video composition -> video validation) without publishing live to YouTube:

1. Set `DRY_RUN=true` in `.env` or check the **Dry Run** box in Dashboard Settings.
2. Click **⚡ Generate Short Now** in the Admin Dashboard.
3. The video will be rendered and validated in under 15 seconds.
4. Click the **▶ Preview** button on the video row to watch the generated 9:16 vertical Short right in your browser!

---

## 🔍 Troubleshooting & Common Errors

* **`quotaExceeded` on YouTube Upload**: Google grants a standard quota of 10,000 units/day. A video upload costs 1,600 units. 2 daily Shorts consume 3,200 units, well within free daily limits. If exceeded, wait for midnight PT reset.
* **`invalid_grant` YouTube OAuth**: Token expired or revoked. Visit the Admin Dashboard and click **Connect YouTube** to re-authorize.
* **FFmpeg Not Found**: Ensure FFmpeg is installed (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Ubuntu/Debian). Render standard environments support FFmpeg.
