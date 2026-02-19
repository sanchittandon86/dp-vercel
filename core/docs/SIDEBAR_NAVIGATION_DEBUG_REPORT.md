# Sidebar Navigation Debug Report

**Issue:** When navigating from Dashboard to OMS via Core sidebar, sidebar behavior becomes incorrect (closes unexpectedly or becomes unresponsive).

**Scope:** Core only (host/shell). OMS and Dashboard are federated remotes.

---

## 1. Core sidebar implementation (located)

| Piece | Location | Role |
|-------|----------|------|
| **SidebarProvider** | `core/src/components/ui/sidebar.tsx` (function SidebarProvider) | Holds sidebar state: `open`, `openMobile`, `state` (expanded/collapsed). Renders `SidebarContext.Provider` and the **sidebar-wrapper** div (`data-slot="sidebar-wrapper"`). |
| **AppSidebar** | `core/src/components/app-sidebar.tsx` | Renders the actual sidebar UI (nav links, footer). Uses `<Sidebar>` from ui/sidebar and `useSidebar()` / `useModules()`. |
| **AppLayout** | `core/src/App.tsx` | Wraps main content: SidebarInset > Header + main > **Routes**. Does not wrap the sidebar; sibling of AppSidebar. |
| **sidebar-wrapper** | `core/src/components/ui/sidebar.tsx` (inside SidebarProvider) | Single `div` with `data-slot="sidebar-wrapper"` wrapping **both** AppSidebar and AppLayout. No `aria-hidden` in code. No key. |

**Tree:**

```
App
  BrowserRouter
    SidebarProvider
      SidebarContext.Provider
        TooltipProvider
          div[data-slot="sidebar-wrapper"]   ← one wrapper for everything
            AppSidebar
            AppLayout (SidebarInset > Header > main > Routes)
```

---

## 2. Navigation flow (Dashboard → OMS)

**When user clicks "OMS" in sidebar:**

1. **AppSidebar** renders a `NavLink` per `availableModules` item. OMS has `to="/oms"`.
2. **Click handler:** `onClick={() => { if (isMobile) setOpenMobile(false) }}` — on **mobile** the sheet is closed; on desktop nothing else runs.
3. **NavLink** triggers React Router navigation to `/oms` (client-side; no full page reload).

**Re-renders:**

- **BrowserRouter** passes new `location` down.
- **AppSidebar** uses `useLocation()` → re-renders (updates `isActive` for nav items).
- **AppLayout** uses `useSidebar()` and `useModules()` → re-renders (context and module list unchanged by route).
- **SidebarProvider** does not use `useLocation()`. It re-renders only when its own state (`open`, `openMobile`, or `useIsMobile()`) changes, or when its children cause a parent re-render. So it re-renders as a consequence of child re-renders, but **does not remount** (no key, no conditional that unmounts it).

**Unmount / remount:**

- **SidebarProvider:** Does **not** remount. No key; no conditional that removes it.
- **AppLayout:** Does **not** remount. Same.
- **Routes:** Does **not** remount. It is always rendered; only the matched route’s `element` changes.
- **Route elements:** The matched route switches from `<FederationMFE module={dashboard}>` to `<FederationMFE module={oms}>`. So **FederationMFE(dashboard) unmounts** and **FederationMFE(oms) mounts**. This is expected; only the MFE content swaps.

**Conclusion:** Layout (SidebarProvider, sidebar-wrapper, AppSidebar, AppLayout, Routes) does **not** unmount on navigation. Only the federated content (Dashboard vs OMS) swaps.

---

## 3. Core routing

- **BrowserRouter:** In `App.tsx` at root: `<BrowserRouter><SidebarProvider>...</SidebarProvider></BrowserRouter>`.
- **Routes:** Inside AppLayout, inside `<main>`. Single `<Routes>` with:
  - One `<Route key={m.id} path={`${m.path}/*`} element={<FederationMFE module={m} />} />` per `availableModules` (e.g. `/dashboard/*`, `/oms/*`).
  - One catch-all `<Route path="*" element={loading ? ... : ...} />`.
- **Conditional:** The catch-all’s **element** is conditional (loading vs redirect vs “no modules”). The **Routes** component itself is always mounted; we do not swap `<Routes>` for something else on loading. So no teardown of the route tree on loading toggle.

**OMS when federated:** `remoteEntry.tsx` exports `OmsRoutes` as default (no `BrowserRouter`). So Core gets a component that only renders `<Routes>` with relative paths; it runs under Core’s `BrowserRouter`. No nested `BrowserRouter` from OMS in the host.

---

## 4. Sidebar collapse logic

- **State:** In **SidebarProvider**: `open` (desktop expanded/collapsed), `openMobile` (mobile sheet open/closed). `state = open ? "expanded" : "collapsed"`.
- **aria-hidden:** Not set anywhere in Core sidebar code on the wrapper or the sidebar panel.
- **inert:** In `core/src/components/ui/sidebar.tsx`, on the **desktop** Sidebar panel only (the `div` with `data-slot="sidebar"`): `inert={collapsed || undefined}`. So when `state === "collapsed"`, the sidebar panel (not the whole wrapper) is inert. The **sidebar-wrapper** div never has `inert` or `aria-hidden`.
- **On NavLink click (mobile):** `setOpenMobile(false)` closes the sheet. Desktop: no state change from the link click.

---

## 5. Root cause analysis

**What does *not* appear to be the cause:**

- **Layout remounting:** SidebarProvider, AppLayout, and Routes do not unmount on route change; no keys or conditionals that would remove them.
- **Routes unmounting:** Routes are always rendered; only the catch-all’s element content and the matched Route’s element change.
- **Loading tearing down the route tree:** Loading is handled inside the catch-all’s element; the `<Routes>` node is always present.
- **Nested BrowserRouter from OMS:** Federated entry exports `OmsRoutes` without a router; Core’s BrowserRouter is the only one.

**What could explain the misbehavior:**

1. **Mobile: Sheet + portal**  
   On mobile, the sidebar is a Radix **Sheet** (portal). After navigating to OMS, `setOpenMobile(false)` closes the sheet. If “unresponsive” means the sheet won’t open again when tapping the hamburger:
   - Possible **focus** or **focus trap** interaction after OMS mounts (e.g. OMS focuses an input; Radix might leave focus management in a bad state).
   - Or **z-index / stacking**: OMS content or remotes’ UI could sit above the sheet overlay so the overlay or trigger appears unclickable.
   - Or **state not updating**: `openMobile` might not be toggling back to `true` (e.g. if something is calling `setOpenMobile(false)` again or preventing the Header button’s onClick).

2. **Desktop: inert + focus**  
   When the sidebar is **collapsed**, the sidebar panel has `inert`. If, during navigation or OMS mount, focus somehow moves into the sidebar (e.g. browser or a11y behavior), the inert subtree could cause focus to move again or trigger browser quirks. Less likely to “close” the sidebar but could contribute to odd behavior.

3. **availableModules reference**  
   `availableModules = modules.filter(...)` is a **new array every render**. Route children are created with `availableModules.map(...)`. Keys are stable (`m.id`), so React should reconcile by key and not remount layout. If React Router or a parent were sensitive to the Route children array identity, it could in theory cause extra reconciliation; no evidence in code that this remounts the layout.

4. **Remote-side behavior**  
   OMS (or Dashboard) might:
   - Call `navigate()` or change history in a way that triggers an extra navigation or re-render.
   - Render a portal or overlay that captures clicks or focus.
   - Cause a re-render that briefly changes something (e.g. `useIsMobile()` or context) in a way that affects the sidebar. This was not verified in remote code.

---

## 6. Structured report

### === FINDINGS ===

**What remounts**

- Only the **federated content** (the `<Route>` element): `FederationMFE` for Dashboard unmounts, `FederationMFE` for OMS mounts. No layout or sidebar component remounts.

**What does not remount**

- SidebarProvider, sidebar-wrapper div, AppSidebar, AppLayout, Routes.

**What state is owned where**

- **SidebarProvider:** `open` (desktop), `openMobile` (mobile sheet). Not tied to route.
- **useModules:** `modules`, `loading`, `availableModules`. Fetched once (effect with `[]`); not refetched on route change.

**Why sidebar might misbehave**

- **Mobile:** After navigation, the sheet is closed by design. If reopening fails, the most plausible causes are focus/portal behavior after OMS mounts, or z-index/stacking so the overlay or menu button is not clickable. Less likely: `openMobile` not toggling back due to an errant `setOpenMobile(false)` or a bug in the Header/Sidebar toggle.
- **Desktop:** No code path that would close the sidebar on navigation. Possible but weaker: interaction between `inert` on the collapsed sidebar and focus when OMS mounts (e.g. focus moving into or out of the inert subtree).

---

### === ROOT CAUSE ===

- **Layout is not remounting** and **Routes are not unmounted** on Dashboard → OMS navigation. So the issue is not “layout recreated on route change.”
- The most plausible root cause is **mobile-specific**: after closing the sheet on NavLink click, something about **focus management**, **portal stacking**, or **state updates** when OMS is mounted prevents the sidebar sheet from opening again or makes the toggle appear unresponsive.
- On desktop, if the sidebar “closes unexpectedly,” it would require some code path or side effect that sets `open` to `false` (or `openMobile` to `false` on mobile) on or after navigation; no such path was found in Core. So either it’s coming from the remotes (e.g. focus/navigate) or from a specific environment (e.g. dev tools, Strict Mode, or a11y behavior).

---

### === RECOMMENDED FIX ===

1. **Confirm environment:** Reproduce on mobile vs desktop; note whether the sidebar is expanded or collapsed when navigating. Check if the hamburger still fires `toggleSidebar` (e.g. log in Header `onMenuClick`).
2. **Mobile:** Ensure the Sheet overlay and trigger have a high enough z-index so they are above OMS content; consider calling `setOpenMobile(false)` in a short `setTimeout` after navigation so focus and portal updates complete before closing. If Radix Sheet has a “focus on close” option, ensure focus moves to main content, not into a trap.
3. **Desktop:** If the sidebar visually “closes” on navigation, add a one-off log in SidebarProvider when `setOpen` or `setOpenMobile` is called (and from which component) to see if something is toggling state. If nothing calls it, the cause is likely visual/CSS (e.g. overflow or width) rather than state.
4. **Remotes:** In OMS (and Dashboard if needed), avoid calling `navigate()` on mount or in effects that run on every mount; avoid rendering full-page overlays or portals that could cover the shell’s header/sidebar trigger.
5. **Optional:** Memoize the list passed to Routes (e.g. `availableModules` or the Route elements) so the Route children array reference is stable across re-renders and rule out any router sensitivity to child identity.

---

*End of report. No code changes were applied; this is analysis only.*
