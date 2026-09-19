# Council Agent 2: Tenant Provisioning Routes and Sessions

## Findings

1. **Critical:** all generated roles shared one password and reruns reset rotated credentials.
2. **Important:** stale control-plane routing could survive a successful rerun.
3. **Important:** a provisioned account shell still requires website, address, public summary, ministries, and leader onboarding.

## Resolution

Generated seeds require distinct role password variables and preserve credentials by default. Routing metadata is reconciled. All five live accounts authenticated and matched the expected application roles. Documentation now distinguishes provisioning from launch readiness.
