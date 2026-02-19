/**
 * Remote app contract for MFEs consumed by Core.
 * When the system grows, remotes can export a typed contract so Core imports
 * against it and avoids silent breaking changes between teams.
 *
 * Current usage: Core uses React.lazy(import('remote/App')) and expects
 * a default export that is a React component. This interface documents
 * the optional extended contract for future use (e.g. mount/unmount lifecycle).
 */
export interface RemoteApp {
  /** Optional: mount into a host-provided element (for non-React integration) */
  mount?: (el: HTMLElement) => void
  /** Optional: unmount / cleanup when host removes the remote */
  unmount?: (el: HTMLElement) => void
}

import type { ComponentType } from 'react'
/** Default export of a federated remote is a React component; it may also satisfy RemoteApp later */
export type FederatedAppComponent = ComponentType
