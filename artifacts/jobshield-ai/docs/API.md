# API

All routes are mounted under `/api`. The source-of-truth contract is [`lib/api-spec/openapi.yaml`](../../../lib/api-spec/openapi.yaml).

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Service health |
| `POST` | `/analyze` | Analyze pasted text or locally extracted PDF text |
| `POST` | `/analyze-url` | Analyze a public job listing URL |
| `GET` | `/analyses` | List the current anonymous session's reports |
| `GET` | `/analyses/{id}` | Retrieve one report owned by the current session |
| `DELETE` | `/analyses/{id}` | Delete one report owned by the current session |
| `DELETE` | `/analyses/clear` | Delete the current session's reports |
| `GET` | `/dashboard` | Session-scoped counts and recent reports |
| `GET` | `/companies/search?query=...` | Search public sources through TinyFish when configured |

## Submission examples

`POST /api/analyze`:

```json
{
  "inputType": "text",
  "content": "Paste the job or offer text here.",
  "companyHint": "Optional company hint",
  "roleHint": "Optional role hint"
}
```

`inputType` can be `text` or `pdf`. The `pdf` value describes text extracted locally; the API never accepts the original file.

`POST /api/analyze-url`:

```json
{
  "url": "https://careers.example.com/jobs/123",
  "companyHint": "Optional company hint",
  "roleHint": "Optional role hint"
}
```

## Report semantics

- `riskScore` is a versioned, rule-based indicator from 0–100; it is not a probability.
- `riskLevel` can be `lower`, `moderate`, `elevated`, or `insufficient_evidence`.
- `verificationStatus` describes what could be found in public excerpts; it does not authenticate a recruiter.
- `researchStatus` distinguishes completed, unavailable, partial, and not-configured research.
- `aiStatus` reports whether the optional AI explanation provider is configured.
- Evidence URLs and excerpts are source leads. A result labeled `official_candidate` is a search candidate, not a verified official source.

## Limits and errors

- JSON request bodies are capped at 256 KB; submitted content is capped at 50,000 characters.
- Analysis requests are limited to 10 per client IP per 15 minutes; public-source searches are limited to 30 per client IP per 15 minutes. Limits are process-local.
- Invalid inputs return `400`; cross-session or missing reports return `404`; rate limits return `429`; unavailable storage/session configuration returns `503`.
- API responses never include provider keys or raw server error details.
