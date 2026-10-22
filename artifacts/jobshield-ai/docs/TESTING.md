# Testing and demo

## Automated checks

Run:

```sh
pnpm run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/jobshield-ai run typecheck
pnpm --filter @workspace/jobshield-ai run build
```

The API test suite covers public URL rejection, basic public URL acceptance, deterministic warning signals, and the inconclusive/no-warning case. It does not invoke TinyFish or make external requests.

## Manual demo

1. Open the app's `/` route.
2. Choose **Analyze an offer**.
3. Paste a job message that includes a payment request, urgency, or sensitive-information request. Use fictional details only.
4. Review the report's warnings, verification status, evidence, limitations, and next steps.
5. Use the public URL tab with a public careers listing, or search the Company sources page.
6. Open **Your history** to delete a report or clear the session.
7. Open **Safety guide** for the non-automated verification checklist.

If TinyFish is not configured or unavailable, the report must say so and explain that the rule-based checks still ran. Do not describe this state as a successful live-source verification.

No seeded or fabricated analysis reports are included.
