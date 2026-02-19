# MFE Stack — Vercel Deployment Playbook

**Purpose:** Production-ready report and playbook for deploying core (host), dashboard (remote), and oms (remote) as **three separate Vercel projects** with independent releases.

---

## === ARCHITECTURE ===

### Host app

| Item | Value |
|------|--------|
| **App** | **core** |
| **Role** | Host / shell |
| **Path** | `core/` |
| **Framework** | React 19 + Vite 7 |
| **Entry** | `index.html` → `src/main.tsx` → `App.tsx` |
| **Port (local)** | 5173 |

Core provides the single shell: sidebar, header, router. It does **not** expose any federation modules; it only **consumes** remotes.

### Remote apps

| App | Path | Port (local) | Exposes |
|-----|------|--------------|---------|
| **dashboard** | `dashboard/` | 5175 | `./App` → `src/remoteEntry.tsx` |
| **oms** | `oms/` | 5174 | `./App` → `src/remoteEntry.tsx` |

Each remote builds a **fixed-name** `remoteEntry.js` under `assets/` so the host can load `{baseUrl}/assets/remoteEntry.js`.

### How federation is wired

1. **Build time (Core):**  
   - `core/scripts/generate-module-json.js` runs first (via `npm run build` or `predev`).  
   - It writes `core/public/module.json` from env (`VITE_REMOTE_DASHBOARD_URL`, `VITE_REMOTE_OMS_URL`) or localhost fallback.  
   - `core/vite.config.ts` reads `public/module.json` (or falls back to the same env vars if the file is missing) and builds:
     - `remotes.dashboard` = `{baseUrl}/assets/remoteEntry.js`
     - `remotes.oms` = `{baseUrl}/assets/remoteEntry.js`
   - `@originjs/vite-plugin-federation` on Core is configured with these `remotes`; the plugin injects runtime logic to load those URLs when `import('dashboard/App')` or `import('oms/App')` runs.

2. **Runtime (Core):**  
   - Browser loads Core’s app.  
   - Core fetches `/module.json` (same content as build-time file, served from `dist`).  
   - `useModules()` parses it and runs a **health check** (HEAD/GET to each `baseUrl`).  
   - Only modules with `available: true` are shown in the sidebar and routable.  
   - When the user navigates to e.g. `/dashboard`, Core renders `<FederationMFE module={...} />`, which does `React.lazy(() => import('dashboard/App'))`.  
   - The federation runtime loads `{dashboardBaseUrl}/assets/remoteEntry.js` and then the exposed `./App`; the remote’s React tree renders inside Core’s layout with **shared** React/react-dom from the host.

3. **Remotes:**  
   - Each remote’s Vite config uses `@originjs/vite-plugin-federation` with `exposes: { './App': './src/remoteEntry.tsx' }` and `filename: 'remoteEntry.js'`.  
   - `rollupOptions.output.chunkFileNames` forces the remote-entry chunk to be named `assets/remoteEntry.js` (no hash) so the host’s URL is stable.

### How routing works

- **Core:** Single `BrowserRouter`. Routes are built from `module.json`: for each available module, `path={`${m.path}/*`}` with `element={<FederationMFE module={m} />}`. Catch-all `path="*"` redirects to the first available module or shows “No modules available”.
- **Dashboard:** Exposes a single default export (the Dashboard UI). No router in the exposed component; it’s a single view.
- **OMS:** Exposes `OmsRoutes` (internal `Routes` for `/` and `/order/:instrumentId`) so it lives under Core’s router; Core’s route is `/oms/*`, so OMS handles `/oms`, `/oms/order/123`, etc.

### How module.json participates

| Phase | Use |
|-------|-----|
| **Build time** | Core’s `vite.config.ts` reads `core/public/module.json` (or env) to set federation `remotes`. The file is **generated** by `scripts/generate-module-json.js` before `vite build` / before `vite` (via `predev`). |
| **Runtime** | Core’s app fetches `/module.json` (from `dist`, same content). Used for sidebar links, route list, and health checks. |

**Rule:** `core/public/module.json` is a **build artifact** (gitignored). It must never be committed with localhost in main. Production builds must set `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL` so the generated file (and thus both build-time and runtime) uses production remote URLs.

---

## === PER APP ===

### Core (host)

| Field | Value |
|-------|--------|
| **Framework** | React 19, Vite 7, TypeScript |
| **Entry** | `index.html` → `src/main.tsx` → `App.tsx` |
| **Federation** | Consumer only. `remotes` from `public/module.json` or env. No exposes. |
| **Build command** | `npm run build` → `node scripts/generate-module-json.js && tsc -b && vite build` |
| **Output directory** | `dist` |
| **Shared deps** | react ^19, react-dom ^19, react-router-dom (host provides; remotes consume) |
| **Env vars** | `VITE_REMOTE_DASHBOARD_URL`, `VITE_REMOTE_OMS_URL` (production; no trailing slash) |
| **Blocks isolated deployment?** | No. Tailwind has no `@source` of other apps. `module.json` is generated; `vite.config` has env fallback if file missing. |

### Dashboard (remote)

| Field | Value |
|-------|--------|
| **Framework** | React 19, Vite 7, TypeScript |
| **Entry (standalone)** | `index.html` → `src/main.tsx` → `App.tsx`. Federated entry: `src/remoteEntry.tsx` → re-exports `App`. |
| **Federation** | Exposes `./App` → `./src/remoteEntry.tsx`. `filename: 'remoteEntry.js'`. No remotes. |
| **Build command** | `npm run build` → `tsc -b && vite build` |
| **Output directory** | `dist` |
| **Shared deps** | react ^19, react-dom ^19 (requiredVersion). React Compiler disabled to avoid singleton issues. |
| **Env vars** | None required for this POC. |
| **Blocks isolated deployment?** | No. No cross-app fs or Tailwind. |

### OMS (remote)

| Field | Value |
|-------|--------|
| **Framework** | React 19, Vite 7, TypeScript/JS mix |
| **Entry (standalone)** | `index.html` → `src/main.tsx` → `App.tsx`. Federated: `src/remoteEntry.tsx` → exports `OmsRoutes` as default. |
| **Federation** | Exposes `./App` → `./src/remoteEntry.tsx`. `filename: 'remoteEntry.js'`. No remotes. |
| **Build command** | `npm run build` → `tsc -b && vite build` |
| **Output directory** | `dist` |
| **Shared deps** | react ^19, react-dom ^19, react-router-dom. React Compiler disabled. |
| **Env vars** | None required for this POC. |
| **Blocks isolated deployment?** | No. |

---

## === VERCEL COMPATIBILITY VERIFICATION ===

| Check | Status | Notes |
|-------|--------|--------|
| **Each app deployable independently** | Yes | No root workspace; each app has its own `package.json`, `node_modules`, build. Core does not read dashboard/oms filesystem. |
| **Tailwind @source cross-app** | Fixed | Core’s `index.css` has no `@source` of sibling apps. Contract: new utilities must be added to Core first. See `core/docs/REMOTE_STYLING_CONTRACT.md`. |
| **fs reads in vite.config** | Safe | Core reads only `core/public/module.json` (inside Core’s tree). If file is missing, config falls back to `VITE_REMOTE_*` env. Generate script runs before build so file exists in normal flow. |
| **Localhost URLs** | Controlled | Only in `generate-module-json.js` as **fallback** when env is unset (local dev). Production must set env; `module.json` is gitignored so main never contains localhost. |
| **CORS risks** | Possible | Core’s `useModules` does HEAD/GET to each remote’s `baseUrl`. Remotes must allow Core’s origin (or allow GET for `/` or a health URL). Static `remoteEntry.js` on Vercel is usually served without strict CORS; if you add custom headers, allow Core’s origin. |
| **React singleton** | OK | All three use React 19; federation `shared` with `requiredVersion: '^19.0.0'`. React Compiler disabled in remotes to avoid useMemoCache conflicts. |
| **Asset path** | OK | No `base` or `assetPrefix`; remotes serve at root. Host loads `{baseUrl}/assets/remoteEntry.js`. Vercel serves `dist` at root. |

**Fragile / edge cases:**

- **Core build without generate script:** If someone runs `vite build` in Core without running the generate script (e.g. no `npm run build`), `module.json` may be missing. The config now falls back to env; if env is also unset, `remotes` will be empty and runtime federation will fail. **Mitigation:** Always use `npm run build` on Core (Vercel does).
- **Health check CORS:** If a remote returns CORS that blocks the origin of Core, `checkModuleAvailable` will fail and that module will be hidden. Ensure remotes don’t block Core’s origin on the URL used for the check (root or `/health.json` if you add it).
- **Order of deployment:** Core’s build needs production remote URLs. Deploy dashboard and oms first, then set their URLs in Core’s env and deploy Core.

---

## === CONCRETE FIXES (ALREADY APPLIED OR RECOMMENDED) ===

### 1. Generate module.json from env at build time — DONE

- **Script:** `core/scripts/generate-module-json.js` writes `core/public/module.json` from `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL`, with localhost fallback when unset.
- **Core package.json:** `"build": "node scripts/generate-module-json.js && tsc -b && vite build"`, `"predev": "node scripts/generate-module-json.js"`.
- **Gitignore:** `core/public/module.json` is ignored so it is never committed.

### 2. Federation remotes use prod URLs — DONE

- Remotes are derived from the **generated** `module.json` (so they use whatever baseUrl is in that file, i.e. prod when env is set).
- **Hardening:** `core/vite.config.ts` now uses `getFederationRemotes()`: if `public/module.json` does not exist, it builds `remotes` from `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL`. So even if the generate step were skipped, setting env in Vercel would still produce the correct remote URLs at build time.

### 3. Remove cross-MFE Tailwind coupling — DONE

- Removed `@source "../../dashboard/src"` and `@source "../../oms/src"` from `core/src/index.css`.
- Contract: remotes only use utilities that Core already includes; new utilities are added in Core first. Documented in `core/docs/REMOTE_STYLING_CONTRACT.md`.

### 4. Improve federation remote resolution — DONE

- Core’s config reads `module.json` when present; otherwise uses env. No change to how remotes are **resolved at runtime** (that’s handled by the federation plugin and the generated manifest).

### 5. Harden remote loading — OPTIONAL (later)

- **Health endpoint:** Remotes can expose `/health.json` with `{ "status": "ok", "version": "1.3.0" }` and Core can check that instead of (or in addition to) `baseUrl`. See `core/docs/HEALTH_ENDPOINT_CONTRACT.md`.
- **Error boundary:** Wrapping `<FederationMFE>` in an error boundary would avoid a single failing remote breaking the whole shell. Recommended when you add more remotes.

---

## === EXACT VERCEL SETTINGS ===

### Core (host)

| Setting | Value |
|--------|--------|
| **Root Directory** | `core` |
| **Framework Preset** | Vite |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Required env vars** | `VITE_REMOTE_DASHBOARD_URL`, `VITE_REMOTE_OMS_URL` (production URLs of dashboard and oms deployments; no trailing slash). |

### Dashboard (remote)

| Setting | Value |
|--------|--------|
| **Root Directory** | `dashboard` |
| **Framework Preset** | Vite |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Required env vars** | None for this POC. |

### OMS (remote)

| Setting | Value |
|--------|--------|
| **Root Directory** | `oms` |
| **Framework Preset** | Vite |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Required env vars** | None for this POC. |

---

## === DEPLOYMENT PLAYBOOK ===

### Deployment order

1. **Deploy remotes first** (order doesn’t matter):  
   - Deploy **dashboard** (Root: `dashboard`, Build: `npm run build`, Output: `dist`).  
   - Deploy **oms** (Root: `oms`, Build: `npm run build`, Output: `dist`).  
   - Note the production URLs (e.g. `https://dashboard-xxx.vercel.app`, `https://oms-xxx.vercel.app`).

2. **Configure and deploy Core:**  
   - Create Core project (Root: `core`, Build: `npm run build`, Output: `dist`).  
   - Set env vars:  
     - `VITE_REMOTE_DASHBOARD_URL` = `https://dashboard-xxx.vercel.app`  
     - `VITE_REMOTE_OMS_URL` = `https://oms-xxx.vercel.app`  
   - Deploy. The build will generate `module.json` with these baseUrls and embed the same URLs in the federation remotes.

3. **Smoke test:** Open Core’s URL. Sidebar should show Dashboard and OMS; navigating to each should load the remote without errors. If a remote is down or CORS blocks the health check, it will be hidden from the sidebar (graceful degradation).

### Example env vars (Core on Vercel)

```bash
VITE_REMOTE_DASHBOARD_URL=https://dashboard-mfe.vercel.app
VITE_REMOTE_OMS_URL=https://oms-mfe.vercel.app
```

(Use your actual Vercel URLs; no trailing slash.)

### Example production module.json (generated output)

This is what the generate script writes when the above env vars are set (and what gets copied to `dist` so the browser fetches it at `/module.json`):

```json
{
  "modules": [
    {
      "id": "dashboard",
      "path": "/dashboard",
      "label": "Dashboard",
      "icon": "LayoutDashboard",
      "baseUrl": "https://dashboard-mfe.vercel.app"
    },
    {
      "id": "oms",
      "path": "/oms",
      "label": "Order Management",
      "icon": "ClipboardList",
      "baseUrl": "https://oms-mfe.vercel.app"
    }
  ]
}
```

Federation remotes at build time will be:

- `dashboard` → `https://dashboard-mfe.vercel.app/assets/remoteEntry.js`
- `oms` → `https://oms-mfe.vercel.app/assets/remoteEntry.js`

### Step-by-step Vercel instructions

1. **Create three Vercel projects** (same repo, or separate; if same repo, use Root Directory to separate).
2. **Dashboard project:** Root Directory = `dashboard`, Build = `npm run build`, Output = `dist`, Install = `npm install`. Deploy.
3. **OMS project:** Root Directory = `oms`, same. Deploy.
4. **Core project:** Root Directory = `core`, Build = `npm run build`, Output = `dist`, Install = `npm install`. Add env vars `VITE_REMOTE_DASHBOARD_URL` and `VITE_REMOTE_OMS_URL` with the dashboard and oms deployment URLs. Deploy.
5. **CORS (if needed):** If Core’s health check or script load fails, ensure the remote deployments allow the Core origin. Vercel’s default static hosting usually does not block; if you add a custom server or headers, allow `Access-Control-Allow-Origin` for Core’s origin.
6. **Verify:** Open Core URL → click Dashboard and OMS → confirm remotes load and no console errors.

### Common mistakes checklist

- [ ] **Skipping the generate step:** Always use `npm run build` for Core (never run only `vite build` without env or generated `module.json`).
- [ ] **Committing module.json:** Keep `core/public/module.json` in `.gitignore`; never commit localhost in main.
- [ ] **Wrong Root Directory:** Each Vercel project must have Root Directory set to `core`, `dashboard`, or `oms` so install and build run in the correct app.
- [ ] **Wrong Output Directory:** Must be `dist` for all three (Vite default).
- [ ] **Trailing slash in env:** Use `https://dashboard-xxx.vercel.app` not `https://dashboard-xxx.vercel.app/`.
- [ ] **Deploying Core before remotes:** Core needs remote URLs; deploy dashboard and oms first, then set their URLs in Core’s env and deploy Core.
- [ ] **React version mismatch:** Keep React 19 (and react-dom) aligned across core, dashboard, and oms to avoid duplicate React or hooks errors.
- [ ] **Using dev:remote as Build Command:** On Vercel use `npm run build`, not `npm run dev:remote` (that’s for local preview).
- [ ] **Adding a new remote without Core changes:** New MFE requires: entry in `generate-module-json.js`, env var, lazy import and entry in `FederationMFE.tsx`, type in `federation.d.ts`, icon in `app-sidebar.tsx` ICON_MAP. See root README “How to add a new MFE”.

---

**Summary:** The stack is **safely deployable to Vercel** with three independent projects. Core’s build is isolated (no Tailwind @source of other apps), `module.json` is env-driven and generated, and federation remotes resolve to production URLs when env is set. Use the deployment order and checklist above for production.
