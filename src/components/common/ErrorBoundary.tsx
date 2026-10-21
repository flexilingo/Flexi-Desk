import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * React unmounts the entire tree when a render throws. Without a boundary that
 * leaves a blank window with no clue what happened — the error only exists in a
 * devtools console the desktop build doesn't open.
 *
 * This catches it and shows the message, so a failure is diagnosable from a
 * screenshot instead of guesswork.
 */
interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private reset = () => this.setState({ error: null, componentStack: null });

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <div className="w-full max-w-2xl space-y-3">
          <h1 className="text-lg font-bold text-error">Something broke</h1>
          <p className="text-sm font-semibold">{error.message}</p>

          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
            {error.stack}
            {componentStack}
          </pre>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
