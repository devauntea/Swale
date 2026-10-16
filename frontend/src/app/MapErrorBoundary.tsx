import { Component, type ErrorInfo, type ReactNode } from "react";

/** Keep local planning controls usable if the lazy map chunk or renderer fails. */
export class MapErrorBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Swale map failed to render", error, info.componentStack);
    this.props.onFailure();
  }

  render() {
    if (this.state.failed)
      return (
        <div className="map-status map-failed" role="alert">
          <strong>City map unavailable</strong>
          <p>
            The map could not load or render. Local fixture controls and the
            demonstration assistant remain available.
          </p>
          <button onClick={() => window.location.reload()}>
            Reload workspace
          </button>
        </div>
      );
    return this.props.children;
  }
}
