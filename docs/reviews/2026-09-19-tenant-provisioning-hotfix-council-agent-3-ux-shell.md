# Council Agent 3: Tenant Provisioning Operator Safety

## Findings

1. **Critical:** the documented idempotent rerun could destroy profile-linked data.
2. **Critical:** partial failures occurred before a recovery record was written.
3. **Important:** shared passwords, invented contact data, and global email matching were unsafe for a real client.

## Resolution

Reruns preserve profile IDs and dependent data, the password-free recovery record is written before remote mutation, cross-church reuse is rejected, each role uses a distinct credential, and placeholder profiles are hidden, non-contactable, and not roster eligible.
