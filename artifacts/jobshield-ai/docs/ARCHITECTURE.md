# Architecture

## Request flow

1. The React/Vite app collects a public listing URL, pasted offer text, or text extracted locally from a PDF.
2. Generated React Query hooks call the shared Express API under `/api`. OpenAPI in `lib/api-spec/openapi.yaml` is the contract; generated React and Zod clients are updated with the `@workspace/api-spec` codegen command.
3. The API creates or validates a signed anonymous-session cookie. The session token is HMAC-signed; only its SHA-256 hash is stored with reports.
4. The deterministic analyzer extracts limited company/role/domain hints and checks explicit warning patterns. It does not decide whether a company is fraudulent.
5. When TinyFish is configured, the API searches public sources using limited search terms and fetches only public URLs that pass URL and DNS checks. Retrieved sources remain labeled as leads, not proof.
6. The API validates the report with generated Zod schemas, stores the report, and returns it to the web app.

## Workspace structure

- `artifacts/jobshield-ai`: React/Vite UI and PDF.js browser extraction.
- `artifacts/api-server`: Express routes, validation, TinyFish adapter, URL safety, session handling, and analysis rules.
- `lib/api-spec`: OpenAPI contract and code-generation configuration.
- `lib/api-client-react`: generated React Query client.
- `lib/api-zod`: generated Zod request/response schemas.
- `lib/db`: Drizzle schema and PostgreSQL access.

## Runtime behavior

- Provider credentials are read by the server only. They are never returned to the browser or written to logs.
- A missing TinyFish key yields an explicit `not_configured` research status; provider failures yield `unavailable`.
- No model-backed conclusion is required for basic analysis. The current report status remains `not_configured` until a model provider is configured.
- Community reports, public user accounts, shared profiles, and moderator/admin screens are intentionally absent.

## Important data boundaries

- Original PDF bytes are handled only in the browser and are not sent to the API.
- The report database stores the generated report and selected external evidence, not original pasted text.
- A search result or matching domain is not an authenticated source of identity.
- Browser-session history is not cross-device and is not a user account.
