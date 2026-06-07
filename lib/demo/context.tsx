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
  const stored = sessionStorage.getItem("cc_demo_session_id");
  if (stored) return stored;
  const newId = crypto.randomUUID();
  sessionStorage.setItem("cc_demo_session_id", newId);
  return newId;
}

function ActiveDemoSessionProvider({ children }: { children: React.ReactNode }) {
  // Initialize to "" so server and client render the same HTML (no hydration mismatch).
  // useEffect runs only on the client and sets the real sessionStorage-backed ID.
  const [sessionId, setSessionId] = useState<string>("");
  const [breadcrumbs, dispatchBreadcrumb] = useReducer(breadcrumbsReducer, []);
  const startTimeRef = useRef<number>(0);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(resolveSessionId()); // intentional: SSR renders "" to avoid hydration mismatch; client sets real sessionStorage-backed ID on mount
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
