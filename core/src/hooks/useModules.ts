import { useEffect, useState } from 'react';

export interface ModuleConfig {
  id: string;
  path: string;
  label: string;
  icon: string;
  baseUrl: string;
}

export interface ModuleWithAvailability extends ModuleConfig {
  available: boolean;
}

const HEALTH_CHECK_TIMEOUT_MS = 3000;

/** Remote entry URL the host actually loads; more accurate than baseUrl for "can we load this MFE" */
function getRemoteEntryUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/assets/remoteEntry.js`;
}

async function checkModuleAvailable(moduleConfig: ModuleConfig): Promise<boolean> {
  const { baseUrl } = moduleConfig;
  if (!baseUrl || baseUrl === '' || baseUrl === window.location.origin) {
    return true;
  }
  const remoteEntryUrl = getRemoteEntryUrl(baseUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(remoteEntryUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    clearTimeout(timeoutId);
    try {
      const c2 = new AbortController();
      const t2 = setTimeout(() => c2.abort(), HEALTH_CHECK_TIMEOUT_MS);
      const res = await fetch(baseUrl, { method: 'HEAD', signal: c2.signal });
      clearTimeout(t2);
      return res.ok;
    } catch {
      return false;
    }
  }
}

function parseModuleList(data: unknown): ModuleConfig[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as { modules?: unknown }).modules)) {
    return [];
  }
  const list = (data as { modules: unknown[] }).modules;
  return list.filter((m): m is ModuleConfig => {
    return (
      m != null &&
      typeof m === 'object' &&
      typeof (m as ModuleConfig).id === 'string' &&
      typeof (m as ModuleConfig).baseUrl === 'string' &&
      typeof (m as ModuleConfig).path === 'string'
    );
  });
}

export function useModules() {
  const [modules, setModules] = useState<ModuleWithAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/module.json');
        if (!res.ok) throw new Error('Failed to load module config');
        const data = await res.json();
        const list = parseModuleList(data);
        const withAvailability: ModuleWithAvailability[] = await Promise.all(
          list.map(async (m) => ({
            ...m,
            available: await checkModuleAvailable(m),
          }))
        );
        if (!cancelled) {
          setModules(withAvailability);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error('Unknown error'));
          setModules([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableModules = modules.filter((m) => m.available);

  return { modules, availableModules, loading, error };
}
