import "server-only";

type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
};

export function isSchemaCacheError(
  error: PostgrestLikeError | null | undefined,
  status?: number | null,
) {
  return (
    status === 503 ||
    error?.code === "PGRST002" ||
    error?.message?.toLowerCase().includes("schema cache") === true ||
    error?.message?.toLowerCase().includes("querying schema") === true
  );
}

export function toFriendlySupabaseErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("schema cache") ||
    normalized.includes("querying schema")
  ) {
    return "Local Supabase is not ready yet. Wait a few seconds and try again.";
  }

  return message;
}
