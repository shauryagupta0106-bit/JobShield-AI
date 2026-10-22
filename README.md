# JobShield AI: Verify Before You Apply

JobShield AI is an AI-assisted job and internship verification platform designed for students, fresh graduates, and early-career professionals. It empowers job seekers to investigate suspicious job opportunities by comparing claims with public evidence, detecting warning signals, and producing transparent, evidence-backed risk assessments.

The product's guiding principle is: **Investigate an opportunity before you trust it.**

---

## Architecture Diagram

```mermaid
graph TD
    User([User / Job Seeker]) -->|Interacts with| WebApp[React + Vite Frontend\nStrictly Light Theme]
    WebApp -->|PDF Upload| ClientPDF[Client-side PDF.js\nExtracts Text Locally]
    ClientPDF -->|Extracted Text Only| WebApp

    WebApp -->|HTTP /api Proxy| ApiServer[Express 5 API Server\nTypeScript + Zod]
    
    subgraph Security & Session
        ApiServer --> SessionMgr[HMAC-SHA256 Signed\nAnonymous Session Cookies]
        ApiServer --> RateLimiter[In-Memory Token Bucket\nRate Limiter]
        ApiServer --> UrlSafety[SSRF Protection &\nPublic DNS Validator]
    end

    subgraph Verification Engine
        ApiServer --> RulesEngine[Deterministic Rule Engine\n6 Warning Signal Checks]
        ApiServer --> TinyFishClient[TinyFish Research Client\nSearch & Fetch APIs]
        ApiServer --> AiClient[Groq AI Client\nqwen/qwen3.8-27b Structured JSON]
    end

    subgraph External Services
        TinyFishClient -->|GET /api.search| TinyFishSearch[TinyFish Search API\nPublic Web Leads]
        TinyFishClient -->|POST /api.fetch| TinyFishFetch[TinyFish Fetch API\nClean Markdown Pages]
        AiClient -->|POST /openai/v1/chat/completions| Groq[Groq Cloud API\nqwen/qwen3.8-27b Explanations]
    end

    subgraph Data Persistence
        ApiServer --> DrizzleORM[Drizzle ORM]
        DrizzleORM --> PostgresDB[(PostgreSQL / Supabase\n30-Day Retention Policy)]
        ApiServer -.->|Graceful Fallback| MemoryCache[In-Memory Session Store\nResilient Offline Mode]
    end
```

---

## 1. Project Overview & Problem Statement

Job seekers often encounter fraudulent or deceptive job opportunities:
- Impersonation of legitimate companies and fake recruiters.
- Demands for registration, training, background check, or equipment fees before employment.
- High-pressure tactics and unrealistic guarantees ("Selected without an interview!").
- Requests for sensitive personal data (passwords, banking credentials, identity documents).
- Shortened URLs and suspicious domains masquerading as official career portals.

Manual verification is difficult and time-consuming. JobShield AI centralizes this verification process into a single, intuitive interface.

---

## 2. Key Features

- **Pasted Text & Message Analysis**: Validates and analyzes job listings, recruiter WhatsApp/Telegram messages, and emails.
- **Public URL Verification**: Safely parses public HTTP/HTTPS listing URLs with defense-in-depth SSRF protections against internal, loopback, private, and credentialed endpoints.
- **Client-Side PDF Extraction**: Reads offer-letter PDFs entirely in the browser using `pdfjs-dist`. Original PDF files are never uploaded to the server, protecting applicant privacy.
- **Deterministic Risk Rules**:
  - `upfront_fee`: Recruitment, training, interview, or registration fee requests (Elevated).
  - `guaranteed_outcome`: Guaranteed hiring without interviews (Caution).
  - `high_pressure`: Artificial urgency ("Act within 2 hours", "Limited slots") (Caution).
  - `sensitive_information`: Requests for passport, bank logins, or card PINs (Caution).
  - `personal_recruiter_email`: Recruiter using free mailboxes like Gmail/Yahoo instead of company domain (Caution).
  - `shortened_link`: Destination hidden behind URL shorteners like bit.ly (Caution).
- **Live Public Research with TinyFish**: Searches official career domains and fetches clean markdown page content via official TinyFish Search and Fetch APIs.
- **Model-Backed AI Explanation (Groq)**: Uses Groq (`qwen/qwen3.8-27b`) with structured JSON output to summarize findings, formulate assessment rationales, and tailor recruiter verification questions. Prompts treat user text and web pages strictly as untrusted data to prevent prompt injection.
- **Evidence-Based Assessment (No Numerical Score)**: Replaces misleading percentage/gauge scores with 4 evidence-grounded statuses: *Evidence of concern*, *Mixed or conflicting evidence*, *No major warning signs found in the checks performed*, and *Insufficient evidence to assess*.
- **Private Session History & Dashboard**: Uses cryptographic HMAC-signed anonymous session cookies to provide private 30-day report history without requiring a password or user account.
- **Public Company Source Search**: Direct search interface for discovering published company career domains and corroborating sources.
- **Practical Safety Guide**: Actionable guidance for students on verification habits and reporting impersonation.
- **Strictly White Design**: Professional, clean, accessible UI built with Tailwind CSS, Lucide icons, and zero dark-mode artifacts.

---

## 3. Technology Stack

- **Monorepo / Workspace**: `pnpm` workspaces
- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS v4, Wouter, `@tanstack/react-query`, `pdfjs-dist`
- **Backend**: Express 5, Node.js 24, TypeScript, Zod, Drizzle ORM, Pino logger
- **Database**: PostgreSQL (via `pg` and Drizzle ORM) with Supabase compatibility
- **Research Provider**: TinyFish Search & Fetch APIs
- **AI Provider**: Groq (`qwen/qwen3.8-27b` via official Groq Cloud API with JSON schema enforcement)

---

## 4. Repository Structure

```text
JobShield-AI/
├── artifacts/
│   ├── api-server/             # Express 5 backend API server
│   │   ├── src/
│   │   │   ├── app.ts          # Express middleware and routing
│   │   │   ├── index.ts        # Server entry point with startup validation
│   │   │   ├── lib/
│   │   │   │   ├── logger.ts   # Pino logging
│   │   │   │   └── jobshield/
│   │   │   │       ├── ai.ts           # Groq structured explanation service
│   │   │   │       ├── analysis.ts     # Risk detection rules & analysis engine
│   │   │   │       ├── jobshield.test.ts # Automated test suite (40 tests)
│   │   │   │       ├── rate-limit.ts   # IP rate limiting
│   │   │   │       ├── session.ts      # HMAC-signed anonymous session cookies
│   │   │   │       ├── tinyfish.ts     # TinyFish Search & Fetch client
│   │   │   │       └── url-safety.ts   # SSRF defense & DNS validation
│   │   │   └── routes/
│   │   │       ├── health.ts   # GET /api/healthz
│   │   │       ├── index.ts    # Main API router
│   │   │       └── jobshield.ts# Analysis, History, Dashboard, Search routes
│   │   └── package.json
│   ├── jobshield-ai/           # React + Vite frontend application
│   │   ├── src/
│   │   │   ├── App.tsx         # Main application routes & pages
│   │   │   ├── main.tsx        # React root mounting
│   │   │   └── index.css       # Tailwind design tokens & white-theme styles
│   │   ├── vite.config.ts      # Vite dev/build configuration with /api proxy
│   │   └── package.json
│   └── mockup-sandbox/         # Mockup sandbox artifact
├── lib/
│   ├── api-client-react/       # Generated React Query hooks (Orval)
│   ├── api-spec/               # OpenAPI 3.1 specification & Orval config
│   │   └── openapi.yaml
│   ├── api-zod/                # Generated Zod validation schemas
│   └── db/                     # Drizzle ORM schema & Postgres client
│       └── src/schema/
│           └── jobshield-analyses.ts
├── .env.example                # Documented configuration template
├── package.json                # Workspace root scripts
├── pnpm-workspace.yaml         # Workspace package definitions
└── README.md
```

---

## 5. Prerequisites & Environment Setup

### Prerequisites
- **Node.js**: v20+ (Node.js v24.14.0 recommended)
- **pnpm**: v9+ (v12.14.0 verified)
- **Git**: For version control

### Environment Variables

Copy `.env.example` to `.env` in the project root:

```powershell
cp .env.example .env
```

| Variable | Required | Description | Example / Format |
|---|---|---|---|
| `DATABASE_URL` | **Yes** (for persistence) | PostgreSQL connection URI | `postgresql://postgres:password@localhost:5432/jobshield` |
| `SESSION_SECRET` | **Yes** | 32+ character key for signing session cookies | `aribtayabbutterafnan21101310` |
| `TINYFISH_API_KEY` | Optional | TinyFish Search & Fetch API key | `sk-tinyfish-...` |
| `GROQ_API_KEY` | Optional | Groq API key for structured AI explanations (`qwen/qwen3.8-27b`) | `gsk_...` |
| `PORT` | Optional | API server port (defaults to `5000`) | `5000` |

> **Supabase Note**: If using Supabase, obtain the PostgreSQL URI from **Supabase Dashboard -> Project Settings -> Database -> Connection String (URI)** (e.g. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`). Do not use the REST project URL (`https://...`).

---

## 6. How to Run Locally (Windows PowerShell)

### The Simplest 1-Command Startup (Recommended)

From the project root:

```powershell
cd C:\Users\dell\Downloads\hack\JobShield-AI
pnpm install
pnpm dev
```

`pnpm dev` runs `scripts/dev.mjs`, which:
- Validates ports `5000` (API) and `3000` (Web UI) before launching.
- Starts the Express API server and React frontend in a single terminal.
- Color-codes output logs (`[api]` in cyan, `[web]` in green).
- Configures the Vite proxy (`/api` -> `http://localhost:5000`).
- Gracefully kills both process trees on `Ctrl+C`.

**Access URLs:**
- **Web Application**: [`http://localhost:3000`](http://localhost:3000)
- **API Server**: [`http://localhost:5000`](http://localhost:5000)
- **API Health Endpoint**: [`http://localhost:5000/api/health`](http://localhost:5000/api/health) (or `/api/healthz`)

---

### Alternative: Two-Terminal Startup

If you prefer separate terminal windows:

#### Terminal 1 — API Server:
```powershell
cd C:\Users\dell\Downloads\hack\JobShield-AI
pnpm --filter @workspace/api-server run dev
```

#### Terminal 2 — Frontend:
```powershell
cd C:\Users\dell\Downloads\hack\JobShield-AI
pnpm --filter @workspace/jobshield-ai run dev
```

---

### Troubleshooting Port Conflicts (EADDRINUSE)

If port 5000 or 3000 is occupied by a stale Node.js process:

```powershell
# 1. Identify which process is listening on port 5000:
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | Select-Object LocalPort, OwningProcess

# 2. Stop the process safely:
Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# 3. Repeat for port 3000 if needed:
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 7. How to Run Automated Tests & Checks

Execute all checks across the repository:

```powershell
# 1. Typecheck libraries and schemas
pnpm run typecheck:libs

# 2. Typecheck the backend API server
pnpm --filter @workspace/api-server run typecheck

# 3. Run backend automated test suite (40 tests)
pnpm --filter @workspace/api-server run test

# 4. Typecheck the React frontend
pnpm --filter @workspace/jobshield-ai run typecheck

# 5. Build production frontend bundle
pnpm --filter @workspace/jobshield-ai run build

# 6. Build the whole workspace
pnpm run build
```

---

## 8. API Specification & Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` or `/api/healthz` | Server & DB health check (`{"status": "ok", "services": {"tinyfish": true, "groq": true}}`) |
| `POST` | `/api/analyze` | Analyze pasted text or extracted PDF text |
| `POST` | `/api/analyze-url` | Safely analyze a public job listing URL |
| `GET` | `/api/analyses` | List recent analyses for current anonymous session |
| `GET` | `/api/analyses/:id` | Get full report details for a specific analysis |
| `DELETE` | `/api/analyses/:id` | Delete an analysis from current session history |
| `DELETE` | `/api/analyses/clear` | Clear all session analyses |
| `GET` | `/api/dashboard` | Dashboard metrics (total, concern count) |
| `GET` | `/api/companies/search`| Search public web sources for a company/role |

---

## 9. Security & Privacy Safeguards

- **SSRF Protection**: `assertPublicUrl` validates destination hostnames and DNS resolutions against IPv4/IPv6 private ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, link-local, multicast, etc.). Blocks ports other than 80/443 and strips credential/signature query parameters.
- **Prompt Injection Defense**: User opportunity text and fetched pages are treated strictly as untrusted data wrapped in isolation tags. Model instructions explicitly prohibit external content from overriding system instructions.
- **Credential Safety**: All API keys (`GROQ_API_KEY`, `TINYFISH_API_KEY`, `SESSION_SECRET`, `DATABASE_URL`) are read exclusively on the server and never sent to browser bundles.
- **Client-Side PDF Processing**: PDFs are parsed using `pdfjs-dist` in the applicant's browser. Original PDF files are never uploaded or stored on disk.
- **Session Privacy**: Analyses are indexed by HMAC-SHA256 hashes of private anonymous session tokens (`jobshield_session`), preventing unauthorized users from accessing or deleting another user's reports.
- **Rate Limiting**: Sliding-window rate limiters prevent abuse on analysis (10/15 min) and search (30/15 min) endpoints.

---

## 10. Known Limitations & Roadmap

- **Evidence-Based Heuristic Indicators**: JobShield AI provides objective, evidence-based status assessments (`evidence_of_concern`, `conflicting_evidence`, `no_major_warnings`, `insufficient_evidence`). It does not compute an arbitrary mathematical risk score or offer a legal fraud determination. Absence of detected warnings is never equated to proof of legitimacy.
- **Community Reports & Moderation**: Community reporting and admin moderation are planned for future phases when authenticated user identities and human moderation pipelines are established.
- **Scanned / Image-Only PDFs**: PDFs containing only scanned images without an OCR text layer cannot be read by client-side PDF.js. Users are prompted to paste text instead.
