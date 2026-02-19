import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  moduleId: string
  onRetry?: () => void
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Catches errors from federated remote render or chunk load failure.
 * Prevents one broken remote from white-screening the shell.
 */
export class FederationErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry?.()
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load {this.props.moduleId}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          {this.props.onRetry && (
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
