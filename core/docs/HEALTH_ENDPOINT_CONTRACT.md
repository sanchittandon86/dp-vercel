# Health endpoint contract (recommended for remotes)

Currently Core checks remote availability by issuing a `HEAD` or `GET` request to the remote’s `baseUrl`. That works but is fragile for partial outages or canary releases.

## Recommended pattern (future)

Each remote exposes a **health endpoint** that Core can call:

- **URL:** `{baseUrl}/health.json` (or `/health`)
- **Response:** JSON, e.g.:

```json
{
  "status": "ok",
  "version": "1.3.0"
}
```

Core would then:

1. Prefer fetching `{baseUrl}/health.json` instead of (or in addition to) `baseUrl` for availability.
2. Use `status === "ok"` and optionally `version` for rollout or feature logic.

## Implementation options

- **Static file:** In the remote app, add `public/health.json` with the above content. Build will copy it to `dist/`. Update it via build or deploy step if you need a dynamic version.
- **Server/edge:** If the remote is eventually served by a server or edge function, implement a route that returns this JSON.

This is **not required** for the current POC; the existing `baseUrl` fetch is sufficient until you need partial outages or canary behavior.
