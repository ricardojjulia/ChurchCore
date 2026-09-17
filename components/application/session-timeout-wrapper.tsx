"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { signOutAction } from "@/app/sign-in/actions";
import { Modal, Button, Group, Stack, Text } from "@mantine/core";

type Props = {
  children: React.ReactNode;
};

const TIMEOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const WARNING_DURATION = 14 * 60 * 1000; // 14 minutes

export function SessionTimeoutWrapper({ children }: Props) {
  const [showWarning, setShowWarning] = useState(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveRef = useRef<number>(0);
  const showWarningRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    showWarningRef.current = showWarning;
  }, [showWarning]);

  const handleLogout = useCallback(() => {
    setShowWarning(false);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    const message = "Your session has expired due to inactivity.";
    signOutAction(`/sign-in?message=${encodeURIComponent(message)}`);
  }, []);

  const startTimers = useCallback(() => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);

    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true);
    }, WARNING_DURATION);

    logoutTimerRef.current = setTimeout(() => {
      handleLogout();
    }, TIMEOUT_DURATION);
  }, [handleLogout]);

  const extendSession = () => {
    lastActiveRef.current = Date.now();
    setShowWarning(false);
    startTimers();
  };

  useEffect(() => {
    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"];

    // Initialize timers on mount
    lastActiveRef.current = Date.now();
    startTimers();

    const handleActivity = () => {
      // Use the ref to prevent stale closures
      if (showWarningRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastActiveRef.current >= TIMEOUT_DURATION) {
        handleLogout();
        return;
      }

      lastActiveRef.current = now;
      startTimers();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [startTimers, handleLogout]);

  return (
    <>
      {children}
      <Modal
        opened={showWarning}
        onClose={handleLogout}
        title="Session Expiring"
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        transitionProps={{ duration: 0 }}
      >
        <Stack>
          <Text size="sm">
            Are you still there? Your session is about to expire due to inactivity.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={handleLogout}>
              Log Out
            </Button>
            <Button onClick={extendSession}>
              Extend Session
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
