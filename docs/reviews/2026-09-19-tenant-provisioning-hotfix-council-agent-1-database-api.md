# Council Agent 1: Tenant Provisioning Database and API

## Findings

1. **Critical:** reruns deleted established profiles and could cascade-delete operational records.
2. **Critical:** existing-email handling reset Auth credentials before validating tenant ownership.
3. **Important:** control-plane identifiers and routing were not reconciled on rerun.
4. **Important:** inactive memberships were ignored instead of repaired, and fake phone values were inserted.

## Resolution

Profile identities are now updated in place, email ownership is checked before Auth mutation, passwords are preserved unless reset explicitly, memberships and control-plane rows are upserted, the runtime church ID is the control-plane external ID, and unknown phones remain null. Regression tests and live five-role verification passed.
