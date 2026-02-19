# MFE Stack — Production Review Report (Fintech-Grade)

**Scope:** Vite + React 19 micro-frontend stack (core = host, dashboard + oms = remotes) on Vercel with independent deploys.

---

## 1. Production correctness validation

| Check | Result | Notes |
|-------|--------|--------|
| **Federation wiring safe for Vercel** | OK | Remotes resolved from generated `module.json` or env; no cross-app fs. Build runs generate script first; vite.config has env fallback if file missing. |
| **Build-time vs runtime consistent** | OK | Same source of truth: `core/public/module.json` generated once, copied to `dist`; Vite reads it at build for remotes; browser fetches `/module.json` at runtime. Env vars drive both when set. |
| **No localhost coupling in prod** | OK | `module.json` is gitignored; generate script uses localhost only when `VITE_REMOTE_*` unset. Production must set env; main must never commit the file. |
| **Tailwind isolated** | OK | No `@source` of sibling apps in `core/src/index.css`. Contract: new utilities added in Core first. |
| **React singleton** | OK | All three use React 19; federation `shared` with `requiredVersion: '^19.0.0'`; React Compiler disabled in remotes. |
| **remoteEntry.js paths stable** | OK | Dashboard and OMS use `chunkFileNames` so remote-entry chunk is `assets/remoteEntry.js` (no hash). Host expects `{baseUrl}/assets/remoteEntry.js`. |
| **Vercel output dirs** | OK | All three: Output Directory = `dist` (Vite default). |

**Verdict:** Configuration is production-correct for Vercel and isolated deploys.

---

## 2. Subtle failure modes

| Failure mode | What happens today | Risk |
|--------------|--------------------|------|
| **Remote is down** | Health check (HEAD/GET to baseUrl) fails → module marked `available: false` → hidden from sidebar and routes. If user had the URL or a stale state, navigating to that route still runs `FederationMFE` → lazy import runs → **chunk load fails** → uncaught error → **shell can white-screen** (no error boundary). | High before hardening. |
| **module.json malformed** | `fetch('/module.json')` then `data.modules` — if not an array or missing, `list` was `data.modules ?? []` so non-array could pass; invalid entries could have missing `baseUrl`/`id`. | Medium. |
| **Env vars missing (Core build)** | Generate script runs first → writes localhost if env unset. So **production build with no env produces localhost in module.json** → runtime and federation point at localhost → remotes never load in prod. | Critical if someone deploys Core without setting env. |
| **React versions drift** | Two React instances (host vs remote) → "Invalid hook call" or duplicate state. Federation `shared` mitigates; version skew (e.g. Core 19, remote 18) can still break. | High if teams drift. |
| **Federation import fails** | `import('dashboard/App')` fails (network, 404, CORS, parse error) → promise rejects → **React.lazy throws** → no error boundary → **entire app can crash**. | High before hardening. |

**Implemented mitigations:**

- **Remote down / federation import fails:** Error boundary around each `FederationMFE` + retry wrapper for lazy imports (see below). One broken remote no longer white-screens the shell.
- **module.json malformed:** `parseModuleList()` validates shape; only valid entries with `id`, `baseUrl`, `path` are used; malformed or non-array yields empty list (shell still works, no remotes).
- **Env missing:** Documented and playbook mandates env on Core. Build does not fail; incorrect behavior is a deployment/config error.

---

## 3. Concrete production hardening (implemented)

### 3.1 Error boundary around federated remotes

**File:** `core/src/components/FederationErrorBoundary.tsx`

- Class component with `getDerivedStateFromError` and `componentDidCatch`.
- Renders fallback UI (module id, error message, **Retry** button).
- `onRetry` triggers remount of the lazy component so the loader runs again.
- Optional `onError(error, errorInfo)` for logging/monitoring.

**Usage:** Each `FederationMFE` wraps its content in `<FederationErrorBoundary moduleId={module.id} onRetry={...}>`. A failed remote shows the fallback instead of crashing the shell.

### 3.2 Retry + timeout for React.lazy remotes

**File:** `core/src/utils/lazyWithRetry.ts`

- `lazyWithRetry(importFn, { retries, delayMs, timeoutMs })` wraps the dynamic import.
- Default: 2 retries, 1.5s delay between attempts. Optional `timeoutMs` to fail fast.
- Transient CDN/network failures often succeed on retry; avoids immediate "Failed to load" for flaky networks.

**Usage:** `FederationMFE` uses `lazyWithRetry(() => import('oms/App'), { retries: 2, delayMs: 1500 })` (and same for dashboard) instead of raw `lazy()`.

### 3.3 Health check: remoteEntry.js instead of baseUrl

**File:** `core/src/hooks/useModules.ts`

- **Before:** Health check was HEAD/GET to `baseUrl` (root of remote origin). That can be 200 while `remoteEntry.js` is 404 (e.g. wrong build or path).
- **After:** Primary check is GET to `{baseUrl}/assets/remoteEntry.js`. If that fails, fallback to HEAD to `baseUrl`. So "available" means "the URL the host actually loads" is reachable.

### 3.4 module.json validation

**File:** `core/src/hooks/useModules.ts`

- `parseModuleList(data)`: ensures `data.modules` is an array; filters to objects with required `id`, `baseUrl`, `path` (string). Malformed or missing modules are dropped; no crash, no bogus routes.

---

## 4. Optional hardening (recommended, not implemented)

- **Versioning of MFEs:** Remotes could expose a build/version in a small manifest or `health.json`; Core could log or display "Dashboard 1.2.0" and detect mismatches. Requires contract and remotes to emit version.
- **Fallback UI per remote:** Already present: error boundary fallback + "Retry". Optional: link to status page or support.
- **Logging hooks:** Pass `onError` from `FederationErrorBoundary` to your logger (e.g. `console.error`, Sentry). Example: `<FederationErrorBoundary onError={(err, info) => logger.error(err, info)} />`.

---

## 5. Vercel workflow validation

| Item | Status | Notes |
|------|--------|--------|
| **Build commands** | Correct | Core: `npm run build` (runs generate then tsc + vite). Dashboard/OMS: `npm run build`. No `dev:remote` on Vercel. |
| **Deployment order** | Safe | Remotes first → note URLs → set Core env → deploy Core. Documented in playbook. |
| **Preview deployments** | Fragile | Core preview build uses env from Vercel project. If preview env is not set, generate script writes **localhost** → preview Core will try to load localhost remotes and fail. **Recommendation:** Set preview env to point to **production** remote URLs (or to preview remote URLs if you deploy remotes on every PR). Same env as production is simplest; otherwise maintain preview-specific env. |
| **Preview-env strategy** | Recommended | In Vercel: use **Environment** (Production / Preview / Development). Production: `VITE_REMOTE_*` = prod URLs. Preview: either same as production (Core preview loads prod remotes) or separate vars for preview remote URLs. Development: optional localhost for local dev. Do not leave Preview env empty. |

---

## 6. Final report

### === CURRENT STATE ===

**Solid:**

- Federation wiring is correct for Vercel; build-time and runtime remote resolution are consistent.
- No localhost in committed code; Tailwind is isolated; React shared; remoteEntry paths stable; output dirs correct.
- **New:** Error boundary around each federated remote; retry on lazy load; health check targets `remoteEntry.js`; module.json parsing validated. One failing remote no longer takes down the shell.

**Fragile:**

- **Preview deployments:** Core preview can get localhost in `module.json` if Preview env vars are not set. Must set env for Preview (or accept "no remotes" for that build).
- **Env discipline:** Production Core **must** have `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL` set. Build does not fail without them; wrong behavior is silent.
- **React version drift:** No lockfile or enforced version across repos; teams could ship different React majors and break singleton. Process or tooling (e.g. shared dependency matrix) recommended as you scale.

---

### === REQUIRED FIXES ===

**None** for current two-remote setup. The hardening above (error boundary, retry, health check, validation) is in place. Remaining risks are operational (env, preview env, React versions).

**Operational requirement:** Set Core’s Vercel env (and Preview env) for remote URLs. No code change can enforce that; only docs and checklist.

---

### === RECOMMENDED IMPROVEMENTS ===

1. **Preview env:** In Vercel, set `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL` for **Preview** (e.g. same as Production so Core preview loads prod remotes).
2. **Error reporting:** Wire `FederationErrorBoundary` `onError` to your logger/APM (e.g. Sentry). Ensures federated load/render failures are visible.
3. **Optional timeout on lazy:** Use `lazyWithRetry(..., { timeoutMs: 10000 })` so slow CDN doesn’t hang forever; after timeout, retries still run.
4. **Remote version in health:** When you add `/health.json` (see HEALTH_ENDPOINT_CONTRACT.md), have Core log or display remote version for support and canary reasoning.
5. **React version contract:** Pin React (and react-dom) to a single minor in a shared doc or dependency matrix; fail CI if remotes drift.

---

### === SCALE READINESS ===

**When adding more MFEs:**

- **Must change:** (1) `core/scripts/generate-module-json.js` — add module entry and env var. (2) `core/src/components/FederationMFE.tsx` — add lazy import and `REMOTE_APPS` entry. (3) `core/src/types/federation.d.ts` — add `declare module 'new-mfe/App'`. (4) `core/src/components/app-sidebar.tsx` — add icon in `ICON_MAP`. (5) Vercel Core project — add `VITE_REMOTE_NEW_MFE_URL`. No central registry yet; each new remote is a manual touch in 4–5 places.
- **Vite config env fallback:** Currently only dashboard and oms. Adding a third remote requires extending `getFederationRemotes()` in `core/vite.config.ts` with another env var (e.g. `VITE_REMOTE_NEW_MFE_URL`) when file is missing. Prefer keeping generate script as single source and always running it; env fallback is for edge cases.

**What breaks at 5+ remotes:**

- **Manual wiring:** REMOTE_APPS, federation.d.ts, app-sidebar ICON_MAP, generate script, and env vars all grow linearly. High chance of forgetting one (e.g. add to generate script but not REMOTE_APPS) → "Unknown module" or missing nav.
- **No single manifest:** module.json is generated from a script that knows every remote. If you split repos, Core needs a way to get the list (API or build-time manifest from a registry). Today it’s one repo and one script.
- **Health check latency:** `Promise.all(list.map(checkModuleAvailable))` — 5 remotes = 5 parallel requests. With 3s timeout each, worst case ~3s before sidebar shows. Acceptable but consider caching or showing "Loading…" with progressive display of modules as they pass health.

**What should be centralized:**

- **Remote registry:** Single source of truth for id, path, label, icon, baseUrl (and optional version). Generate script and Core config consume it. Could be a JSON in repo, or an API that Core’s build calls.
- **Contract and tooling:** One place that defines "how to add a remote" (script or CLI that updates generate-module-json, FederationMFE, federation.d.ts, ICON_MAP, and optionally env template). Reduces human error at 5+ remotes.
- **Shared React version:** Enforce one React (and react-dom) version across host and all remotes (e.g. shared package or CI check) to avoid singleton issues at scale.

---

**Summary:** The stack is **production-ready** for Vercel with the new hardening. No required code fixes; set Core (and Preview) env and follow the playbook. Recommended: preview env, error reporting hook, and as you add remotes, centralize registry and wiring to stay fintech-grade at scale.
