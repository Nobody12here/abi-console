import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ABI Console crashed", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <TriangleAlert size={20} className="crash-icon" />
          <h1>Something went wrong</h1>
          <p>
            Your saved contracts are still in this browser. Reload the page to
            continue. If it keeps happening, export your data from Settings.
          </p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.assign("/")}
          >
            <RotateCcw size={15} /> Reload
          </button>
        </div>
      </div>
    );
  }
}
