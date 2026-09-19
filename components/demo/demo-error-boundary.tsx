"use client";

import React from "react";
import { notifications } from "@mantine/notifications";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useDemoSession } from "@/lib/demo/context";

interface InnerProps {
  sessionId: string;
  breadcrumbs: string[];
  route: string;
  getSessionDuration: () => number;
  children: React.ReactNode;
}

interface InnerState {
  hasError: boolean;
}

class DemoErrorBoundaryInner extends React.Component<InnerProps, InnerState> {
  constructor(props: InnerProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): InnerState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      return;
    }

    const { sessionId, breadcrumbs, route, getSessionDuration } = this.props;

    setTimeout(() => {
      fetch("/api/demo/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          route,
          category: "ERROR",
          error_message: error.message,
          note: null,
          breadcrumbs,
          demo_version: process.env.NEXT_PUBLIC_DEMO_VERSION ?? "",
          session_duration: getSessionDuration(),
        }),
      }).catch(() => {});

      notifications.show({
        title: "Error captured",
        message: "An error was automatically reported.",
        color: "yellow",
        autoClose: 4000,
      });
    }, 0);
  }

  componentDidUpdate(previousProps: InnerProps) {
    if (this.state.hasError && previousProps.route !== this.props.route) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#f7f9fc",
          }}
        >
          <section style={{ maxWidth: 480, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: "#5f6b7a", marginBottom: 20 }}>
              This page could not be displayed. Reload to try again.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Link href="/workspace" style={{ padding: "10px 16px", color: "#075985", fontWeight: 700 }}>
                Go to workspace
              </Link>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  border: 0,
                  borderRadius: 6,
                  padding: "10px 16px",
                  background: "#087f5b",
                  color: "white",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Reload page
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export function DemoErrorBoundary({ children }: { children: React.ReactNode }) {
  const { sessionId, breadcrumbs, getSessionDuration } = useDemoSession();
  const pathname = usePathname();

  return (
    <DemoErrorBoundaryInner
      sessionId={sessionId}
      breadcrumbs={breadcrumbs}
      route={pathname ?? ""}
      getSessionDuration={getSessionDuration}
    >
      {children}
    </DemoErrorBoundaryInner>
  );
}
