"use client";

import React from "react";
import { notifications } from "@mantine/notifications";
import { usePathname } from "next/navigation";

import { useDemoSession } from "@/lib/demo/context";

interface InnerProps {
  sessionId: string;
  breadcrumbs: string[];
  route: string;
  getSessionDuration: () => number;
  children: React.ReactNode;
}

class DemoErrorBoundaryInner extends React.Component<InnerProps> {
  constructor(props: InnerProps) {
    super(props);
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

  render() {
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
