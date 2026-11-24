# Surfare-Final

Surfare is an offline-first React and Vite digital safety application with a local Node detector API.

## Structure

- `frontend/` - React/Vite web application
- `backend/` - Local detector API, detection engine, datasets, optional services, and Cloudflare Worker
- `package.json` - npm workspace commands

## Run

```sh
npm install
npm run backend:dev
npm run dev
```

Open the frontend at `http://localhost:5173`. The Vite server proxies `/api/*` to `http://127.0.0.1:8790`.

## Optional AI help

Enable **AI help** in the checker to share the submitted text, check details,
and Surfy conversation with the configured AI services. Local findings appear
first while the additional assessment runs. Completed, pending, and unavailable
AI checks are shown separately. For links, the AI review is advisory only: it
can flag impersonation, gambling, credential/payment and scam cues from the
submitted text, but it never calls a link legitimate, verified, or safe. Safe
Browsing and the local reviewed lists remain authoritative. New chat questions
include recent conversation and the actual check context; chat answers never
change a verdict. Without this choice, or without internet, Surfy uses local
explanations.

When `AGENT_ROUTER_API_KEY` and `AGENT_ROUTER_MODEL` are set on the server,
Agent Router is tried first for text and Surfy chat. Copy the model ID exactly
from the Agent Router console or pricing page; an unavailable model returns an
error instead of silently routing to another one. The Agent Router names
`AGENTROUTER_API_KEY`, `AGENTROUTER_BASE_URL`, and `AGENTROUTER_MODEL` are also
accepted. Set `AGENT_ROUTER_BASE_URL` if your gateway is not
`https://agentrouter.org/v1`. It is followed by the reviewed free OpenRouter
model and the configured Gemini backup. Existing `OPENROUTER_API_KEY`,
`OPENROUTER_MODEL`, `GEMINI_API_KEY`, and `GEMINI_IMAGE_MODEL` settings still
apply. `AGENT_ROUTER_IMAGE_MODEL` enables an Agent Router vision model for image
review; without it, image review stays on the existing providers. Keys never
enter the frontend. `/api/surfy` serves chat; `/api/detect` runs the extra
assessment only when `ai: true` and `consent: true` are supplied. Provider errors
preserve local findings; AI findings require exact quotes from the submitted
text. Agent Router may be a paid service, so review your gateway billing and
data policy before enabling it.

The OpenRouter text/chat fallback is pinned to
`baidu/ernie-5.5-flash-preview:free`; image review is pinned to
`nvidia/nemotron-3.5-super-vl:free`. Only these reviewed OpenRouter models are
accepted. The old `openrouter/free` setting migrates to the relevant pinned
model. No random model or unreviewed OpenRouter fallback is used. Availability
and quality can change, so maintain this allowlist against local regression checks.

The local Gemini backup is configured with
`GEMINI_IMAGE_MODEL=gemini-3.5-flash-lite`. The same configured Gemini model is
used as backup for text and chat. Temporary server errors get one retry within
the existing request timeout; invalid keys and quota errors are not retried.

AI image checks inspect metadata in the original file before sending the resized
image for visual review. The result and Surfy include metadata findings and read
limitations. Missing metadata does not establish authenticity.

## Scam-awareness practice

Use **Play & learn** in the desktop header, or scroll to **Build your scam
radar**. Surfy's Scam Challenge contains six fictional Philippine scenarios,
each with two decisions, explanations, retry opportunities, and a completion
score. It follows the selected English, Filipino, or Taglish language. Best
completed scores are saved on the device and can be reset from the practice
section. The game makes no API calls and works offline after the app is cached.
Its authored scenarios are separate from detector training and evaluation data.

## Offline resources

On the first online visit, the installed app caches its page and then saves the
files needed for local image text checks in English and Filipino (about 19.3 MB)
in the background. **Download resources** below the checker still shows
progress, cancellation, and retry, and resumes from completed files. Completed
downloads stay on the device until browser storage is cleared. Surfare can be
installed from the browser menu or the **Install Surfare** button where the
browser offers it. After the first online visit, message, link, image, and QR
detection run locally offline; online reputation lookups, AI help, and feedback
are unavailable until you reconnect, and results say so.

The welcome tour includes the download option and the scam-awareness game.

## Validation commands

```sh
npm run backend:test
npm test
npm run build
```
