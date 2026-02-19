import React, { Suspense, useCallback, useState } from 'react'
import type { ModuleWithAvailability } from '@/hooks/useModules'
import { FederationErrorBoundary } from '@/components/FederationErrorBoundary'
import { lazyWithRetry } from '@/utils/lazyWithRetry'

// Lazy-loaded federated apps with retry. Keys must match module.json "id".
// Retry: 2 retries, 1.5s delay; prevents transient CDN/network from failing the user.
const OMSApp = lazyWithRetry(() => import('oms/App') as Promise<{ default: React.ComponentType<object> }>, { retries: 2, delayMs: 1500 })
const DashboardApp = lazyWithRetry(() => import('dashboard/App') as Promise<{ default: React.ComponentType<object> }>, { retries: 2, delayMs: 1500 })

const REMOTE_APPS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  oms: OMSApp,
  dashboard: DashboardApp,
}

interface FederationMFEProps {
  module: ModuleWithAvailability
}

function FederatedFallback() {
  return (
    <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
      Loading remote app…
    </div>
  )
}

/**
 * Renders a remote MFE via Module Federation (same page, shared React).
 * Wrapped in error boundary + retry so one broken remote does not white-screen the shell.
 */
export function FederationMFE({ module }: FederationMFEProps) {
  const [mountKey, setMountKey] = useState(0)
  const RemoteApp = REMOTE_APPS[module.id]

  const handleRetry = useCallback(() => {
    setMountKey((k) => k + 1)
  }, [])

  if (!RemoteApp) {
    return (
      <p className="text-muted-foreground">
        Unknown module: {module.id}. Add it to REMOTE_APPS in FederationMFE.
      </p>
    )
  }

  return (
    <FederationErrorBoundary moduleId={module.id} onRetry={handleRetry}>
      <Suspense fallback={<FederatedFallback />}>
        <RemoteApp key={mountKey} />
      </Suspense>
    </FederationErrorBoundary>
  )
}
