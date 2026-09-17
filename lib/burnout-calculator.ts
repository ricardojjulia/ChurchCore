import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

/**
 * Checks if a volunteer exceeds consecutive or rolling 30-day shift thresholds.
 * High-load warning: 3 or more shifts in a rolling 30 days.
 */
export async function checkVolunteerBurnout(
  churchId: string,
  profileId: string,
  targetStartsAt: string,
): Promise<{ isBurnedOut: boolean; reason?: string }> {
  if (!profileId || !churchId || !targetStartsAt) {
    return { isBurnedOut: false };
  }

  const targetDate = new Date(targetStartsAt);
  // Scan 30 days backward from target date
  const startDate = new Date(targetDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = targetDate.toISOString();

  let count = 0;

  if (shouldUseLocalTenantFallback()) {
    try {
      const res = await queryTenantLocalDb<{ count: number }>(
        `select count(*)::integer as count from public.volunteer_shifts
         where assigned_user_id = $1
           and church_id = $2
           and starts_at >= $3::timestamptz
           and starts_at <= $4::timestamptz
           and confirmation_status != 'declined'`,
        [profileId, churchId, startDate, endDate],
      );
      count = res.rows[0]?.count ?? 0;
    } catch (e) {
      console.error("Local fallback burnout calculation failed:", e);
    }
  } else {
    try {
      const supabase = await createTenantServerClient();
      const { count: dbCount, error } = await supabase
        .from("volunteer_shifts")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", profileId)
        .eq("church_id", churchId)
        .neq("confirmation_status", "declined")
        .gte("starts_at", startDate)
        .lte("starts_at", endDate);

      if (!error) {
        count = dbCount ?? 0;
      }
    } catch (e) {
      console.error("Supabase burnout calculation failed:", e);
    }
  }

  if (count >= 3) {
    return {
      isBurnedOut: true,
      reason: `Volunteer already has scheduled ${count} shifts in the last 30 days.`,
    };
  }

  return { isBurnedOut: false };
}
