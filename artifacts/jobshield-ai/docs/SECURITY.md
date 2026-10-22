# Security and privacy notes

## Implemented controls

- `TINYFISH_API_KEY`, `SESSION_SECRET`, and any model key are server-side only.
- Report ownership uses a signed `HttpOnly`, `SameSite=Lax` cookie. The database stores a hash, not the session token.
- Public URL submissions reject non-HTTP(S) schemes, embedded credentials, sensitive query parameters, unusual ports, localhost/local names, private IPs, and hostnames that resolve to any non-public address.
- TinyFish result links are limited to public HTTP(S) URL syntax before they are returned or considered for retrieval.
- API JSON bodies and provider responses have explicit size limits; external requests have timeouts.
- Analysis and public search endpoints have process-local rate limits.
- Server request logging records method/path/status only; submitted request bodies and credentials are not logged.
- PDF text extraction runs in the browser with PDF.js, an 8 MB file limit, a 100-page limit, and a 30-second parsing timeout. The app extracts text only and does not execute PDF actions.
- React escapes user- and provider-supplied text when rendering it.

## Data handling

Pasted job text is sent to the API when submitted. Optional web research sends limited search terms and selected public URLs to TinyFish. Reports persist for up to 30 days in the anonymous session and include selected public-source excerpts. Original documents and raw pasted text are not persisted.

## Known boundaries

- TinyFish controls network retrieval and any redirects after a validated URL is submitted. Before production use at larger scale, verify the provider's current redirect and destination-IP safeguards and add a redirect-chain regression test.
- Rate-limit buckets are process-local, not shared across multiple API instances.
- Anonymous session cookies are not a substitute for an authenticated account or cross-device recovery.
- Community submissions and admin moderation are not implemented.
- Public-source search results can be stale, incomplete, unrelated, or manipulated. The UI does not treat them as proof.
- The deterministic rules are intentionally explainable but can miss warning signals or produce false positives. Users should verify important claims independently.

## Operational checklist

- Keep `DATABASE_URL`, `SESSION_SECRET`, `TINYFISH_API_KEY`, and optional `OPENAI_API_KEY` in Replit Secrets.
- Use HTTPS in production and rotate session secrets through the environment-secret workflow.
- Review provider data retention and regional processing policies before sending user data.
- Apply dependency updates and rerun the type checks, tests, and production build.
