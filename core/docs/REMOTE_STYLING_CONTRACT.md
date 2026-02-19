# Remote Styling Contract

Core owns **all global styling**. Remotes must not ship Tailwind base/utilities when federated.

## Rules for remotes

| Do | Don't |
|----|--------|
| Use only semantic class names that Core already supports | Ship Tailwind base/utilities in the federation expose chain |
| Rely on Core's CSS (design tokens, `@layer base`, shadcn) | Add `@import "tailwindcss"` or global CSS in `remoteEntry.tsx` or any file exposed to the host |
| Use Tailwind utilities that are already used in Core or listed below | Introduce new utilities without adding them to Core first |

## Contract

**If a remote needs a new utility, it must be added to Core first.**

That means:

1. Add the utility (or the class) to Core's styling layer (e.g. ensure Core's Tailwind build emits it, or add a small “remote palette” in `core/src/index.css` or a dedicated file).
2. Then use it in the remote.

This keeps:

- Isolated builds (Core builds without sibling MFE source trees)
- Preview deployments per app
- Option to move MFEs to separate repos later

## Remotes: what to avoid in the expose chain

- No `@source` of remote paths from Core (removed; Core no longer scans sibling apps).
- No global CSS imports in `remoteEntry.tsx` or in any component re-exported as the federated `App`.
- No `min-h-screen` / full-page backgrounds on the root of the federated component (Core provides layout).

See also `MFE_CSS_FIX.md` in the repo root for the original fix and generic contract.
