# Council Synthesis: Tenant Provisioning Hotfix

**Date:** 2026-09-19
**Status:** Findings resolved; Documenter and PR-review sign-off complete

## Scope

The Council reviewed the live-client provisioning failure and the narrow repair to the shared provisioner, generated client record, tests, and operator documentation.

## Consensus

The original tool was not safe to describe as idempotent. It targeted an obsolete table, deleted profiles during reruns, reset existing passwords before ownership validation, shared one password across roles, and skipped stale routing reconciliation. These were blocking findings because provisioning crosses Auth, tenant, and control-plane boundaries.

## Resolution

- Church setup fields write to the current `churches` schema.
- Profile rows are reconciled in place; no profile deletion occurs.
- Existing emails are checked for church ownership before any Auth mutation.
- Existing passwords are preserved unless `RESET_EXISTING_PASSWORDS=true` is explicit.
- Generated role accounts use distinct password inputs and seed files contain no secrets.
- Memberships, tenant registry data, and connection routing are reconciled on rerun.
- Unknown phone data stays null, and placeholder identities are hidden from directory/contact/roster surfaces.
- Recovery records are emitted before remote provisioning starts.

## Verification

- Focused provisioning tests: 6 passed, including identity preservation, profile-field preservation, cross-tenant and slug-rebind rejection, password preservation, and password-free seed output.
- Live hosted verification: five profiles, five active memberships, all five role sign-ins, repaired external tenant ID and routing metadata, hidden placeholder settings, rejection of the superseded shared password, preservation of an edited administrator title and existing credentials on rerun, and deactivation of a deliberately inserted obsolete role.
- Full repository verification: 1,435 tests passed; lint completed with seven existing warnings and no errors; typecheck and production build passed.

## ADR Decision

No ADR is required. The changes enforce the existing identity and tenant-isolation model rather than introduce a new boundary.

## PR Review

The finished diff received a clean read-only sign-off with no remaining Critical or Important findings.
