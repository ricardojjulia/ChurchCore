# Council Agent 2: Routes and Pages

## Findings

1. **Important:** Communications admits Pastor, ChurchAdmin, and Secretary but hardcodes `/app/pastor` navigation. Use `session.homePath` and role-aware links.
2. **Important:** Communications classifies every Supabase session as live even when the tenant backend is unavailable. Use the established backend-environment check.
3. **Important:** Demo Feedback collapses missing configuration and query failure into an empty queue, causing the UI to announce “All caught up” during an outage.

## Verification Gaps

- Add focused route coverage for Communications roles, readiness query handling, navigation, and no-backend classification.
- Preserve the open control-context E2E scenario as a declared gap until a control-plane test identity exists.

No files were changed by this read-only agent.
