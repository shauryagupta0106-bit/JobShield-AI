# JobShield AI

JobShield AI helps people review suspicious job listings and offers. It presents explicit warning signals, public-source leads, limitations, and practical next steps. Its score is a heuristic indicator—not a probability, a fraud finding, or a guarantee that a company or offer is genuine.

## What is included

- A responsive, light-only web app with overview, analysis, report, history, public-source search, and safety-guide pages.
- Submission by public URL or pasted text. PDFs are read in the browser with PDF.js; the original file is not uploaded or stored.
- A typed Express API backed by PostgreSQL/Drizzle for reports and anonymous-session history.
- Deterministic warning rules and optional TinyFish Search/Fetch research. Missing or unavailable providers are shown explicitly instead of producing fabricated research.
- Rate limits, request validation, bounded request/response sizes, safe public-URL checks, and private-session report ownership.

Community reports, public accounts, user profiles, and admin moderation are not enabled. They need authenticated ownership and a moderation workflow before being exposed safely.

## Run on Replit

The workspace has managed workflows for the API server and web app. Configure these values through Replit Secrets; do not put real secrets in source control:

| Name | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection used by the shared workspace database |
| `SESSION_SECRET` | Yes | Signs anonymous browser-session cookies |
| `TINYFISH_API_KEY` | Optional | Enables live public-source search and page retrieval |
| `GROQ_API_KEY` | Optional | Groq API key for structured AI explanations and claim analysis |

Apply the database schema with:

```sh
pnpm --filter @workspace/db run push
```

The managed workflows run:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/jobshield-ai run dev
```

## Run locally on Windows

The simplest and recommended method is running `pnpm dev` from the repository root:

```powershell
cd C:\Users\dell\Downloads\hack\JobShield-AI
pnpm install
pnpm dev
```

This starts:
- API Server: `http://localhost:5000` (Health: `http://localhost:5000/api/health`)
- Web UI: `http://localhost:3000` (Proxying `/api` to `http://localhost:5000`)

Alternatively, you can run services in two separate terminals without manually setting conflicting `$env:PORT` variables:

In Terminal 1 (API Server):
```powershell
pnpm --filter @workspace/api-server run dev
```

In Terminal 2 (Web UI):
```powershell
pnpm --filter @workspace/jobshield-ai run dev
```

Open `http://localhost:5173`. The Vite development server proxies `/api` to
`API_SERVER_URL`. `TINYFISH_API_KEY` is optional and enables public-source
research; the deterministic checks and app UI do not require it.

## Check the project

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/jobshield-ai run typecheck
pnpm --filter @workspace/jobshield-ai run build
```

## Data and privacy

- Text pasted by a user is sent to the API for analysis. For URL submissions, the API checks the public page through TinyFish when configured.
- For web research, JobShield sends limited search terms (company, role, or public domain) and validated public URLs—not the full pasted offer text—to TinyFish.
- The database stores the report, selected public-source excerpts, labels, and analysis metadata. It does not store the submitted text or original PDF.
- Reports are scoped to a signed, HttpOnly anonymous browser-session cookie and expire after 30 days. Expired rows are removed opportunistically during history and analysis operations.
- Users can delete one report or clear the session's history. Clearing cookies or browser data can remove access to those reports.
- Avoid submitting passwords, one-time codes, bank login details, or unnecessary identity information.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/API.md`](./docs/API.md), [`docs/DATABASE.md`](./docs/DATABASE.md), [`docs/SECURITY.md`](./docs/SECURITY.md), and [`docs/TESTING.md`](./docs/TESTING.md).
