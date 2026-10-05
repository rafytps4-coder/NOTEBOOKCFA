import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: if a screen throws while rendering, show a calm message instead of a blank
 * page. Notes are saved continuously, so reloading is safe.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h1>Something went wrong</h1>
        <p>
          Your notebooks are saved on this device and are not affected. Reloading usually fixes
          this.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => location.reload()}>
            Reload
          </button>
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <a className="btn" href="/library">
            Go to Library
          </a>
        </div>
        <details>
          <summary>Technical details</summary>
          <pre>{String(this.state.error.stack ?? this.state.error.message)}</pre>
        </details>
      </div>
    );
  }
}
