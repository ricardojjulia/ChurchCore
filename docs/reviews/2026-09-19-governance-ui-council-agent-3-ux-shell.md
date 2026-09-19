# Council Agent 3: UX and Shell

## Findings

1. **Important:** Demo Feedback renders a successful empty state when its backend is unavailable. Render an explicit unavailable/error state instead.
2. **Important:** `DemoErrorBoundary` offers only reload, retains its error after route changes, and can trap users on deterministic failures. Reset on route change and provide a safe navigation action.
3. **Minor:** Failed Demo Feedback optimistic mutations roll back silently. Show an operator-facing error notification or inline error.

## Verification Gaps

- Add browser-capability coverage for notification-preference hydration.
- Add error-boundary recovery and mutation-error feedback coverage.

No files were changed by this read-only agent.
