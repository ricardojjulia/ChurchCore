-- Add triage fields to demo_feedback so platform staff can mark items as reviewed.
-- processed: true once the item has been evaluated
-- action: what was done with it

alter table public.demo_feedback
  add column if not exists processed boolean not null default false,
  add column if not exists action text check (
    action in (
      'code_fixed',
      'update_applied',
      'suggestion_not_implemented',
      'suggestion_implemented',
      'bug_fixed',
      'error_fixed',
      'received_and_closed'
    )
  );

-- Update the upsert RPC to expose processed and action in its result set
-- (no change needed to the INSERT logic — these are triage-only fields set by admins)

-- Allow platform staff to update triage fields via the admin UI
create policy "platform_staff_can_update_feedback_triage"
  on public.demo_feedback
  for update
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
