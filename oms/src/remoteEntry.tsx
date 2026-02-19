/**
 * Module Federation remote entry for OMS.
 * Exports OmsRoutes (without BrowserRouter) so it integrates cleanly
 * with the host shell's router context.
 * CSS is imported here so the federation build emits it and Core loads it with the remote.
 */
import './index.css'
export { OmsRoutes as default } from './App'
