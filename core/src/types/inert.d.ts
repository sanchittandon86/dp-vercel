/**
 * Extend JSX to allow the `inert` attribute (HTML Living Standard).
 * Use instead of aria-hidden when hiding a subtree from a11y and focus;
 * avoids "Blocked aria-hidden because its descendant retained focus" in Chrome.
 */
import "react"

declare module "react" {
  interface HTMLAttributes<T> {
    inert?: boolean
  }
}
