-- Re-open processed items when the same issue is re-submitted.
-- Previous version only incremented hit_count, leaving processed=true so the
-- item stayed hidden in the Open queue even after a new submission.

create or replace function public.upsert_demo_feedback(
  p_fingerprint   text,
  p_session_id    text,
  p_route         text,
  p_category      text,
  p_error_message text,
  p_note          text,
  p_breadcrumbs   jsonb,
  p_user_email    text,
  p_user_role     text,
  p_demo_version  text,
  p_metadata      jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.demo_feedback
    (fingerprint, session_id, route, category, error_message, note,
     breadcrumbs, user_email, user_role, demo_version, metadata, hit_count)
  values
    (p_fingerprint, p_session_id, p_route, p_category, p_error_message, p_note,
     p_breadcrumbs, p_user_email, p_user_role, p_demo_version, p_metadata, 1)
  on conflict (fingerprint) do update
    set hit_count  = demo_feedback.hit_count + 1,
        note       = coalesce(p_note, demo_feedback.note),
        breadcrumbs = p_breadcrumbs,
        processed  = false,
        action     = null,
        updated_at = timezone('utc', now());
end;
$$;
