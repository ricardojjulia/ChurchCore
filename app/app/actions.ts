"use server";

import { revalidatePath } from "next/cache";

import { requireChurchSession } from "@/lib/auth";
import {
  createTenantServerClient,
  hasTenantBackendEnv,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type UpdateProfileInput = {
  fullName: string;
  phone: string | null;
  address: string | null;
  preferredContactMethod: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  directoryVisible: boolean;
  contactAllowed: boolean;
};

const ALLOWED_CONTACT_METHODS = new Set(["email", "sms", "app", "none"]);

function validateInput(input: UpdateProfileInput): string | null {
  const name = input.fullName.trim();
  if (!name) return "Full name is required.";
  if (name.length > 200) return "Full name is too long.";
  if (
    input.preferredContactMethod !== null &&
    !ALLOWED_CONTACT_METHODS.has(input.preferredContactMethod)
  ) {
    return "Invalid contact method.";
  }
  return null;
}

export async function updateMemberProfileAction(input: UpdateProfileInput) {
  const session = await requireChurchSession("/app/member");

  const error = validateInput(input);
  if (error) throw new Error(error);

  const fullName = input.fullName.trim();
  const phone = input.phone?.trim() || null;
  const address = input.address?.trim() || null;
  const emergencyContactName = input.emergencyContactName?.trim() || null;
  const emergencyContactPhone = input.emergencyContactPhone?.trim() || null;

  if (!hasTenantBackendEnv() || session.source !== "supabase") {
    // Preview / dev mode — nothing to persist.
    revalidatePath("/app/member");
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    await queryTenantLocalDb(
      `
        update public.profiles
        set
          full_name                = $1,
          phone                    = $2,
          address                  = $3,
          preferred_contact_method = $4,
          emergency_contact_name   = $5,
          emergency_contact_phone  = $6,
          directory_visible        = $7,
          contact_allowed          = $8,
          updated_at               = timezone('utc', now())
        where user_id  = $9
          and church_id = $10
      `,
      [
        fullName,
        phone,
        address,
        input.preferredContactMethod,
        emergencyContactName,
        emergencyContactPhone,
        input.directoryVisible,
        input.contactAllowed,
        session.userId,
        session.appContext.church.id,
      ],
    );
  } else {
    const supabase = await createTenantServerClient();
    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        address,
        preferred_contact_method: input.preferredContactMethod,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        directory_visible: input.directoryVisible,
        contact_allowed: input.contactAllowed,
      })
      .eq("user_id", session.userId)
      .eq("church_id", session.appContext.church.id);

    if (dbError) throw new Error(dbError.message);
  }

  revalidatePath("/app/member");
}
