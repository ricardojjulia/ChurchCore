import "server-only";

type ErrorWithCodeAndMessage = {
  code?: string | null;
  message?: string | null;
};

const LOCAL_CCM_SETUP_COMMAND =
  "npx supabase db reset && ./supabase/scripts/create-dev-users.sh";

function asErrorWithCodeAndMessage(error: unknown): ErrorWithCodeAndMessage {
  if (typeof error === "object" && error !== null) {
    return error as ErrorWithCodeAndMessage;
  }

  return {};
}

export function isMissingCcmSchemaError(error: unknown) {
  const { code, message } = asErrorWithCodeAndMessage(error);
  const normalized = message?.toLowerCase() ?? "";

  if (code === "42P01" && normalized.includes('relation "public.ccm_')) {
    return true;
  }

  if (code === "42883" && normalized.includes("generate_checkin_pin")) {
    return true;
  }

  return (
    normalized.includes('relation "public.ccm_') ||
    normalized.includes("function public.generate_checkin_pin")
  );
}

export function getMissingCcmSchemaMessage() {
  return `Children's Ministry schema is not installed in the local tenant database. Run \`${LOCAL_CCM_SETUP_COMMAND}\` to apply the CCM migration and seed demo data.`;
}

export function logMissingCcmSchema(error: unknown) {
  console.warn(getMissingCcmSchemaMessage(), error);
}
