"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

interface DemoSessionContextValue {
  sessionId: string;
  breadcrumbs: string[];
  getSessionDuration: () => number;
}

const safeDefaults: DemoSessionContextValue = {
  sessionId: "",
  breadcrumbs: [],
  getSessionDuration: () => 0,
};

const DemoSessionContext = createContext<DemoSessionContextValue>(safeDefaults);

function breadcrumbsReducer(state: string[], pathname: string): string[] {
  return [pathname, ...state].slice(0, 5);
}

function resolveSessionId(): string {
  if (typeof window === "undefined") return "";
  const stored = sessionStorage.getItem("cc_demo_session_id");
  if (stored) return stored;
  const newId = crypto.randomUUID();
  sessionStorage.setItem("cc_demo_session_id", newId);
  return newId;
}

function ActiveDemoSessionProvider({ children }: { children: React.ReactNode }) {
  const [sessionId] = useState<string>(resolveSessionId);
  const [breadcrumbs, dispatchBreadcrumb] = useReducer(breadcrumbsReducer, []);
  const startTimeRef = useRef<number>(0);
  const pathname = usePathname();

  useEffect(() => {
    startTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    dispatchBreadcrumb(pathname);
  }, [pathname]);

  const getSessionDuration = () => {
    if (startTimeRef.current === 0) return 0;
    return Math.floor((Date.now() - startTimeRef.current) / 1000);
  };

  return (
    <DemoSessionContext.Provider value={{ sessionId, breadcrumbs, getSessionDuration }}>
      {children}
    </DemoSessionContext.Provider>
  );
}

export function DemoSessionProvider({ children }: { children: React.ReactNode }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return <>{children}</>;
  }
  return <ActiveDemoSessionProvider>{children}</ActiveDemoSessionProvider>;
}

export function useDemoSession(): DemoSessionContextValue {
  return useContext(DemoSessionContext);
}
