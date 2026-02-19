import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'
import path from "path"
import { fileURLToPath } from "url"
import { readFileSync, existsSync } from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Federation remotes: from module.json (build artifact) or env fallback (Vercel/CI)
function getFederationRemotes(): Record<string, string> {
  const moduleJsonPath = path.resolve(__dirname, "public", "module.json")
  if (existsSync(moduleJsonPath)) {
    const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf-8")) as {
      modules: Array<{ id: string; baseUrl: string }>
    }
    const remotes: Record<string, string> = {}
    for (const m of moduleJson.modules ?? []) {
      if (m.baseUrl && m.baseUrl.trim() !== "") {
        const base = m.baseUrl.replace(/\/$/, "")
        remotes[m.id] = `${base}/assets/remoteEntry.js`
      }
    }
    return remotes
  }
  // Env fallback when module.json not yet generated (e.g. vite build run without pre-step)
  const dashboardUrl = (process.env.VITE_REMOTE_DASHBOARD_URL || "").replace(/\/$/, "")
  const omsUrl = (process.env.VITE_REMOTE_OMS_URL || "").replace(/\/$/, "")
  const remotes: Record<string, string> = {}
  if (dashboardUrl) remotes.dashboard = `${dashboardUrl}/assets/remoteEntry.js`
  if (omsUrl) remotes.oms = `${omsUrl}/assets/remoteEntry.js`
  return remotes
}

const federationRemotes = getFederationRemotes()
// https://vite.dev/config/
export default defineConfig({
  server: { strictPort: true, port: 5173 },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
    federation({
      name: 'core',
      remotes: federationRemotes,
      shared: {
        react: { requiredVersion: '^19.0.0' },
        'react-dom': { requiredVersion: '^19.0.0' },
        'react-router-dom': {},
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
