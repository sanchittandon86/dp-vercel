/**
 * Module Federation remote entry for Dashboard.
 * Exposes the Dashboard app for consumption by the core host.
 * CSS is imported here so the federation build emits it and Core loads it with the remote.
 */
import './index.css'
export { default } from './App'
