export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function hasSupabaseDbUrl() {
  return Boolean(process.env.SUPABASE_DB_URL);
}

export function getSupabaseDbUrl() {
  const dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl) {
    throw new Error(
      "SUPABASE_DB_URL is missing. Set it when local direct database fallback is required.",
    );
  }

  return dbUrl;
}

export function shouldUseLocalSupabaseDbFallback() {
  return Boolean(
    hasSupabaseDbUrl() &&
      process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1:54321"),
  );
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return {
    url,
    publishableKey,
  };
}
