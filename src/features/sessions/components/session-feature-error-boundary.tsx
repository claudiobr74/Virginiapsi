"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Isolates a non-critical session widget. A render error here must not
 * replace the clinical session page with the global error boundary.
 */
export class SessionFeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.info(
      "[session-feature-boundary]",
      JSON.stringify({
        name: error.name,
        digest: "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "",
        componentStack: info.componentStack ? "present" : "absent",
      }),
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          <p>Não foi possível carregar este painel.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
