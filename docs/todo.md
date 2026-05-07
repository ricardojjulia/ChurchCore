# TODO

## Sprint 2 Next Steps

ADR 0002 is complete. The control-plane Supabase project now owns platform registry concerns, the tenant project owns church runtime data, and shared database fallbacks have been removed from the active config path.

The next execution focus is Sprint 2 — Admin Dashboard and Church Setup:

- Continue church settings/profile management after the first tenant-backed settings surface.
- Continue church-admin directory polish for people, households, invites, and account approval flows.
- Continue role management hardening after the first per-person role edit flow, including broader review of edge cases around last-admin protection and ministry-leader scope.
- Continue expanding admin dashboard summaries after the first live cards for people, ministries, events, and giving.
- Add focused tests for admin write actions that touch church settings, profile status, role changes, and invitation flows.
- Keep README, CHANGELOG, and relevant `/docs` files updated with each meaningful feature change.

## Supabase Follow-up

ADR 0001 remains approved for Supabase, and ADR 0002 now requires separate configured backends for control-plane and tenant surfaces.

Operational follow-up:

- Keep `.env.local` and hosted environments configured with explicit `CONTROL_PLANE_*` and `TENANT_*` values.
- Keep control-plane registry data in the control-plane project only.
- Keep church operational schema work in the tenant project only.
- Continue tightening tenant-side query parity where local SQL and Supabase relation reads still differ, especially nested counts and multi-table church-scoped joins.
- Add broader automated action coverage for tenant write-side ownership checks as new admin flows land.
- Verify tenant-view audit rows continue to be written through explicit cross-boundary support flows.
