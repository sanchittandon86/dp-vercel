#!/usr/bin/env node
/**
 * Generates core/public/module.json at build time. This file is a build artifact:
 * do not commit it. Production rule: main branch must NEVER contain localhost in module.json.
 *
 * Env vars (for production / Vercel):
 *   VITE_REMOTE_DASHBOARD_URL  e.g. https://dashboard-mfe.vercel.app
 *   VITE_REMOTE_OMS_URL        e.g. https://oms-mfe.vercel.app
 *
 * If not set (local dev), baseUrl falls back to localhost so dev works without env.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const moduleJsonPath = path.join(publicDir, 'module.json');

const dashboardUrl = (process.env.VITE_REMOTE_DASHBOARD_URL || '').replace(/\/$/, '');
const omsUrl = (process.env.VITE_REMOTE_OMS_URL || '').replace(/\/$/, '');

const config = {
  modules: [
    {
      id: 'dashboard',
      path: '/dashboard',
      label: 'Dashboard',
      icon: 'LayoutDashboard',
      baseUrl: dashboardUrl || 'http://localhost:5175',
    },
    {
      id: 'oms',
      path: '/oms',
      label: 'Order Management',
      icon: 'ClipboardList',
      baseUrl: omsUrl || 'http://localhost:5174',
    },
  ],
};

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(moduleJsonPath, JSON.stringify(config, null, 2), 'utf8');
console.log('module.json generated at', moduleJsonPath);
