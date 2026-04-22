"use server";

import { getRequestedPublicChurch } from "@/lib/public-portal-data";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";
import { hasTenantDbUrl } from "@/lib/supabase/config";

export type SubmitPortalAccountRequestInput = {
  churchId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
};

export async function submitPortalAccountRequestAction(
  input: SubmitPortalAccountRequestInput,
) {
  const resolvedChurch = !input.churchId.trim()
    ? await getRequestedPublicChurch()
    : null;
  const churchId = input.churchId.trim() || resolvedChurch?.id || "";
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.trim() || null;

  if (!churchId) {
    throw new Error("Select a church before requesting portal access.");
  }

  if (!firstName || !lastName) {
    throw new Error("First and last name are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  if (!hasTenantBackendEnv() && !hasTenantDbUrl()) {
    return { previewMode: true };
  }

  if (shouldUseLocalTenantFallback() || !hasTenantBackendEnv()) {
    await queryTenantLocalDb(
      `
        select public.submit_account_request($1, $2, $3, $4, $5)
      `,
      [churchId, email, firstName, lastName, phone],
    );

    return { previewMode: false };
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.rpc("submit_account_request", {
    target_church_id: churchId,
    request_email: email,
    request_first_name: firstName,
    request_last_name: lastName,
    request_phone: phone,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { previewMode: false };
}
