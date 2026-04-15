import "server-only";

import type { ChurchAppSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ChurchAdminAccountRequestEntry = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  isExistingMember: boolean;
  createdAt: string;
  linkedProfileId: string | null;
  linkedProfileName: string | null;
  linkedMemberNumber: string | null;
  linkedAccountStatus: string | null;
};

export type ChurchAdminAccountsData = {
  pendingCount: number;
  existingMemberCount: number;
  pendingRequests: ChurchAdminAccountRequestEntry[];
};

export async function getChurchAdminAccountsData(
  session: ChurchAppSession,
): Promise<ChurchAdminAccountsData> {
  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    return {
      pendingCount: 0,
      existingMemberCount: 0,
      pendingRequests: [],
    };
  }

  if (shouldUseLocalTenantFallback()) {
    const result = await queryTenantLocalDb<{
      id: string;
      email: string;
      phone: string | null;
      first_name: string;
      last_name: string;
      is_existing_member: boolean;
      created_at: string;
      profile_id: string | null;
      profile_name: string | null;
      member_number: string | null;
      account_status: string | null;
    }>(
      `
        select
          request.id,
          request.email,
          request.phone,
          request.first_name,
          request.last_name,
          request.is_existing_member,
          request.created_at,
          request.profile_id,
          profile.full_name as profile_name,
          profile.member_number,
          profile.account_status
        from public.account_requests request
        left join public.profiles profile
          on profile.id = request.profile_id
        where request.church_id = $1
          and request.status = 'pending'
        order by request.created_at asc
      `,
      [session.appContext.church.id],
    );

    const pendingRequests = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      isExistingMember: row.is_existing_member,
      createdAt: row.created_at,
      linkedProfileId: row.profile_id,
      linkedProfileName: row.profile_name,
      linkedMemberNumber: row.member_number,
      linkedAccountStatus: row.account_status,
    }));

    return {
      pendingCount: pendingRequests.length,
      existingMemberCount: pendingRequests.filter((request) => request.isExistingMember).length,
      pendingRequests,
    };
  }

  const supabase = await createTenantServerClient();
  const { data } = await supabase
    .from("account_requests")
    .select("id, email, phone, first_name, last_name, is_existing_member, created_at, profile_id, profiles(full_name, member_number, account_status)")
    .eq("church_id", session.appContext.church.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pendingRequests =
    data?.map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

      return {
        id: row.id,
        email: row.email,
        phone: row.phone,
        firstName: row.first_name,
        lastName: row.last_name,
        isExistingMember: row.is_existing_member,
        createdAt: row.created_at,
        linkedProfileId: row.profile_id,
        linkedProfileName:
          profile && typeof profile === "object" && "full_name" in profile
            ? String((profile as { full_name: unknown }).full_name)
            : null,
        linkedMemberNumber:
          profile && typeof profile === "object" && "member_number" in profile
            ? ((profile as { member_number: unknown }).member_number as string | null)
            : null,
        linkedAccountStatus:
          profile && typeof profile === "object" && "account_status" in profile
            ? ((profile as { account_status: unknown }).account_status as string | null)
            : null,
      };
    }) ?? [];

  return {
    pendingCount: pendingRequests.length,
    existingMemberCount: pendingRequests.filter((request) => request.isExistingMember).length,
    pendingRequests,
  };
}
