import {
  createTenantServerClient,
  queryTenantLocalDb,
  shouldUseLocalTenantFallback,
} from "@/lib/supabase/tenant";

export type ConsentCommunicationType = "email" | "sms" | "push" | "in_app";

export type ConsentLogEntryInput = {
  churchId: string;
  profileId: string;
  consentType: string;
  consented: boolean;
  communicationType?: ConsentCommunicationType | null;
};

export async function insertConsentLogEntries(entries: ConsentLogEntryInput[]) {
  if (!entries.length) {
    return;
  }

  if (shouldUseLocalTenantFallback()) {
    for (const entry of entries) {
      await queryTenantLocalDb(
        `
          insert into public.consent_logs (
            church_id,
            profile_id,
            consent_type,
            consented,
            communication_type
          )
          values ($1, $2, $3, $4, $5)
        `,
        [
          entry.churchId,
          entry.profileId,
          entry.consentType,
          entry.consented,
          entry.communicationType ?? null,
        ],
      );
    }

    return;
  }

  const supabase = await createTenantServerClient();
  const { error } = await supabase.from("consent_logs").insert(
    entries.map((entry) => ({
      church_id: entry.churchId,
      profile_id: entry.profileId,
      consent_type: entry.consentType,
      consented: entry.consented,
      communication_type: entry.communicationType ?? null,
    })),
  );

  if (error) {
    throw new Error(error.message);
  }
}
