type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

export type SupabaseSurface = "control-plane" | "tenant";

function getNamedServiceRoleKey(prefix: "CONTROL_PLANE" | "TENANT") {
  return process.env[`${prefix}_SUPABASE_SERVICE_ROLE_KEY`];
}

function getSharedServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

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

function getSurfacePrefix(surface: SupabaseSurface) {
  return surface === "control-plane" ? "CONTROL_PLANE" : "TENANT";
}

export function hasSupabaseEnvForSurface(surface: SupabaseSurface) {
  const prefix = getSurfacePrefix(surface);
  if (surface === "control-plane") {
    return hasNamedSupabaseEnv(prefix);
  }
  return hasNamedSupabaseEnv(prefix) || hasSharedSupabaseEnv();
}

export function getSupabaseEnvForSurface(surface: SupabaseSurface) {
  const prefix = getSurfacePrefix(surface);
  if (hasNamedSupabaseEnv(prefix)) {
    return getNamedSupabaseEnv(prefix);
  }
  if (surface === "tenant") {
    return getSharedSupabaseEnv();
  }
  throw new Error(
    "CONTROL_PLANE_SUPABASE_URL and CONTROL_PLANE_SUPABASE_PUBLISHABLE_KEY are required. " +
      "The shared NEXT_PUBLIC_SUPABASE_* fallback is no longer used for the control-plane surface.",
  );
}

export function getSupabaseSurfaceFallbackOrder(
  preferredSurface: SupabaseSurface,
) {
  return preferredSurface === "control-plane"
    ? (["control-plane", "tenant"] as const)
    : (["tenant", "control-plane"] as const);
}

export function getPreferredSupabaseSurfaceForRedirect(
  target?: string | null,
): SupabaseSurface {
  return target?.startsWith("/control") ? "control-plane" : "tenant";
}

export function getSupabaseRefreshSurfacesForPath(pathname: string) {
  if (pathname.startsWith("/control")) {
    return ["control-plane"] as const;
  }

  if (
    pathname.startsWith("/app") ||
    pathname.startsWith("/portal") ||
    pathname.startsWith("/give") ||
    pathname.startsWith("/auth/confirm")
  ) {
    return ["tenant"] as const;
  }

  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/workspace") ||
    pathname.startsWith("/calendar")
  ) {
    return ["tenant", "control-plane"] as const;
  }

  return [] as const;
}

export function hasControlPlaneSupabaseEnv() {
  return hasSupabaseEnvForSurface("control-plane");
}

export function getControlPlaneSupabaseEnv() {
  return getSupabaseEnvForSurface("control-plane");
}

export function hasTenantSupabaseEnv() {
  return hasSupabaseEnvForSurface("tenant");
}

export function getTenantSupabaseEnv() {
  return getSupabaseEnvForSurface("tenant");
}

export function hasTenantServiceRoleKey() {
  return Boolean(getNamedServiceRoleKey("TENANT") || getSharedServiceRoleKey());
}

export function getTenantServiceRoleKey() {
  const key = getNamedServiceRoleKey("TENANT") || getSharedServiceRoleKey();

  if (!key) {
    throw new Error(
      "TENANT_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY is missing.",
    );
  }

  return key;
}

export function hasControlPlaneDbUrl() {
  return hasNamedDbUrl("CONTROL_PLANE");
}

export function hasControlPlaneBackendConfig() {
  return hasControlPlaneSupabaseEnv() || hasControlPlaneDbUrl();
}

export function getControlPlaneDbUrl() {
  return getNamedDbUrl("CONTROL_PLANE");
}

export function hasTenantDbUrl() {
  return hasNamedDbUrl("TENANT");
}

export function hasTenantBackendConfig() {
  return hasTenantSupabaseEnv() || hasTenantDbUrl();
}

export function getTenantDbUrl() {
  return getNamedDbUrl("TENANT");
}

export function shouldUseLocalControlPlaneDbFallback() {
  if (!hasControlPlaneDbUrl()) return false;
  if (!hasControlPlaneSupabaseEnv()) return true; // DB present but no Supabase — use DB
  return isLocalSupabaseUrl(getControlPlaneSupabaseEnv().url);
}

export function shouldUseLocalTenantDbFallback() {
  if (!hasTenantDbUrl()) return false;
  if (!hasTenantSupabaseEnv()) return true; // DB present but no Supabase — use DB
  return isLocalSupabaseUrl(getTenantSupabaseEnv().url);
}

function isLocalSupabaseUrl(url: string) {
  return url.startsWith("http://127.0.0.1:") || url.startsWith("http://localhost:");
}
