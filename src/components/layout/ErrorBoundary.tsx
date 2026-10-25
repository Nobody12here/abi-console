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
          <span className="crash-icon">
            <TriangleAlert size={22} />
          </span>
          <p className="eyebrow">RENDER FAILURE</p>
          <h1>ABI Console hit an unexpected error</h1>
          <p>
            Your saved contracts are still in this browser. Reload the console
            to continue. If the problem repeats, export your data from Settings
            after reloading.
          </p>
          <pre>{this.state.error.message}</pre>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.assign("/")}
          >
            <RotateCcw size={15} /> Reload console
          </button>
        </div>
      </div>
    );
  }
}
