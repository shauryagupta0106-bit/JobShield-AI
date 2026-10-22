# Database and retention

The application uses the workspace PostgreSQL database through Drizzle. The `jobshield_analyses` table stores:

- A report UUID and a SHA-256 hash of the signed anonymous browser-session token.
- Source type and display label, inferred company/role/domain fields, heuristic score, verification status, and finding count.
- The validated report JSON, including source URLs and selected public-source excerpts.
- Creation and expiry timestamps.

Submitted job text and PDF bytes are not stored. PDF text extraction happens in the browser; extracted text is sent for analysis only when the user submits it.

Reports expire 30 days after creation. Expired rows are purged opportunistically when analysis and history endpoints run; there is no separate cleanup worker. Users can also delete a report or clear all reports owned by the current session.

Apply schema changes in the workspace with:

```sh
pnpm --filter @workspace/db run push
```

Do not run a destructive database reset to apply this schema.
