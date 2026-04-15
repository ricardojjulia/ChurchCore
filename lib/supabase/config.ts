type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

function hasNamedSupabaseEnv(prefix: "CONTROL_PLANE" | "TENANT") {
  return Boolean(
    process.env[`${prefix}_SUPABASE_URL`] &&
      process.env[`${prefix}_SUPABASE_PUBLISHABLE_KEY`],
  );
}

function getNamedSupabaseEnv(prefix: "CONTROL_PLANE" | "TENANT"): SupabaseEnv {
  const url = process.env[`${prefix}_SUPABASE_URL`];
  const publishableKey = process.env[`${prefix}_SUPABASE_PUBLISHABLE_KEY`];

  if (!url || !publishableKey) {
    throw new Error(
      `${prefix}_SUPABASE_URL and ${prefix}_SUPABASE_PUBLISHABLE_KEY are missing.`,
    );
  }

  return {
    url,
    publishableKey,
  };
}

function hasSharedSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function getSharedSupabaseEnv(): SupabaseEnv {
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

function hasNamedDbUrl(prefix: "CONTROL_PLANE" | "TENANT") {
  return Boolean(process.env[`${prefix}_DB_URL`]);
}

function getNamedDbUrl(prefix: "CONTROL_PLANE" | "TENANT") {
  const dbUrl = process.env[`${prefix}_DB_URL`];

  if (!dbUrl) {
    throw new Error(`${prefix}_DB_URL is missing.`);
  }

  return dbUrl;
}

export function hasSupabaseEnv() {
  return (
    hasSharedSupabaseEnv() ||
    hasNamedSupabaseEnv("CONTROL_PLANE") ||
    hasNamedSupabaseEnv("TENANT")
  );
}

export function hasSupabaseDbUrl() {
  return (
    Boolean(process.env.SUPABASE_DB_URL) ||
    hasNamedDbUrl("CONTROL_PLANE") ||
    hasNamedDbUrl("TENANT")
  );
}

export function getSupabaseDbUrl() {
  const dbUrl =
    process.env.SUPABASE_DB_URL ??
    process.env.CONTROL_PLANE_DB_URL ??
    process.env.TENANT_DB_URL;

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
      (
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
        process.env.CONTROL_PLANE_SUPABASE_URL ??
        process.env.TENANT_SUPABASE_URL
      )?.includes("127.0.0.1:54321"),
  );
}

export function getSupabaseEnv() {
  if (hasNamedSupabaseEnv("CONTROL_PLANE")) {
    return getNamedSupabaseEnv("CONTROL_PLANE");
  }

  if (hasNamedSupabaseEnv("TENANT")) {
    return getNamedSupabaseEnv("TENANT");
  }

  return getSharedSupabaseEnv();
}

export function hasControlPlaneSupabaseEnv() {
  return hasNamedSupabaseEnv("CONTROL_PLANE") || hasSharedSupabaseEnv();
}

export function getControlPlaneSupabaseEnv() {
  return hasNamedSupabaseEnv("CONTROL_PLANE")
    ? getNamedSupabaseEnv("CONTROL_PLANE")
    : getSharedSupabaseEnv();
}

export function hasTenantSupabaseEnv() {
  return hasNamedSupabaseEnv("TENANT") || hasSharedSupabaseEnv();
}

export function getTenantSupabaseEnv() {
  return hasNamedSupabaseEnv("TENANT")
    ? getNamedSupabaseEnv("TENANT")
    : getSharedSupabaseEnv();
}

export function hasControlPlaneDbUrl() {
  return hasNamedDbUrl("CONTROL_PLANE") || Boolean(process.env.SUPABASE_DB_URL);
}

export function getControlPlaneDbUrl() {
  return hasNamedDbUrl("CONTROL_PLANE")
    ? getNamedDbUrl("CONTROL_PLANE")
    : getSupabaseDbUrl();
}

export function hasTenantDbUrl() {
  return hasNamedDbUrl("TENANT") || Boolean(process.env.SUPABASE_DB_URL);
}

export function getTenantDbUrl() {
  return hasNamedDbUrl("TENANT") ? getNamedDbUrl("TENANT") : getSupabaseDbUrl();
}

export function shouldUseLocalControlPlaneDbFallback() {
  if (!hasControlPlaneDbUrl()) return false;
  if (!hasControlPlaneSupabaseEnv()) return true; // DB present but no Supabase — use DB
  return getControlPlaneSupabaseEnv().url.includes("127.0.0.1:54321");
}

export function shouldUseLocalTenantDbFallback() {
  if (!hasTenantDbUrl()) return false;
  if (!hasTenantSupabaseEnv()) return true; // DB present but no Supabase — use DB
  return getTenantSupabaseEnv().url.includes("127.0.0.1:54321");
}
