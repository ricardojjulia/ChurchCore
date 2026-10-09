"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
const TICK_MS = 500;

/**
 * Counts inactivity on a shared tablet. After `idleMs - warningMs` of no
 * touch, pointer or key activity `warning` turns on with a `secondsLeft`
 * countdown; at `idleMs` it calls `onIdle` once and goes quiet until `enabled`
 * toggles off and on again. `stayActive()` is the "I'm still here" action.
 * Uses Date.now() deadlines (not a counter), so a throttled background tab
 * still resets on time.
 */
export function useIdleReset({
  enabled,
  idleMs,
  warningMs,
  onIdle,
}: {
  enabled: boolean;
  idleMs: number;
  warningMs: number;
  onIdle: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    let fired = false;

    const onActivity = () => {
      // Once the warning is up, only the explicit button dismisses it, so a
      // stray touch near the dialog cannot hide that the screen is about to clear.
      if (fired) return;
      if (Date.now() - lastActivity.current < idleMs - warningMs) lastActivity.current = Date.now();
    };

    const tick = () => {
      if (fired) return;
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= idleMs) {
        fired = true;
        setSecondsLeft(null);
        onIdleRef.current();
      } else if (elapsed >= idleMs - warningMs) {
        setSecondsLeft(Math.max(1, Math.ceil((idleMs - elapsed) / 1000)));
      }
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      // Leaving the enabled state (or unmounting) drops any warning on screen.
      setSecondsLeft(null);
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [enabled, idleMs, warningMs]);

  const warning = enabled && secondsLeft !== null;
  return { warning, secondsLeft: warning ? secondsLeft : 0, stayActive };
}
