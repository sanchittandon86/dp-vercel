import { lazy, type LazyExoticComponent, type ComponentType } from 'react'

const DEFAULT_RETRIES = 2
const DEFAULT_DELAY_MS = 1500

/**
 * Wraps a dynamic import with retries and timeout. Use for federated remotes
 * so transient network or CDN failures don't immediately fail the user.
 */
export function lazyWithRetry<T extends ComponentType<object>>(
  importFn: () => Promise<{ default: T }>,
  options: {
    retries?: number
    delayMs?: number
    timeoutMs?: number
  } = {}
): LazyExoticComponent<T> {
  const { retries = DEFAULT_RETRIES, delayMs = DEFAULT_DELAY_MS, timeoutMs } = options

  const load = (): Promise<{ default: T }> => {
    const attempt = (remaining: number): Promise<{ default: T }> => {
      const promise = timeoutMs
        ? Promise.race([
            importFn(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Load timeout')), timeoutMs)
            ),
          ])
        : importFn()

      return promise.catch((err) => {
        if (remaining <= 0) throw err
        return new Promise<{ default: T }>((resolve, reject) => {
          setTimeout(() => attempt(remaining - 1).then(resolve).catch(reject), delayMs)
        })
      })
    }
    return attempt(retries)
  }

  return lazy(() => load()) as LazyExoticComponent<T>
}
