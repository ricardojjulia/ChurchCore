export const publicChurchSlugCookieName = "churchforge_public_church_slug";

const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "control",
  "api",
  "admin",
]);

function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/:\d+$/, "");
}

export function extractPublicChurchSlugFromHost(host: string | null | undefined) {
  if (!host) {
    return null;
  }

  const normalizedHost = normalizeHost(host);

  if (
    !normalizedHost ||
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost === "::1"
  ) {
    return null;
  }

  const segments = normalizedHost.split(".").filter(Boolean);

  if (segments.length < 2) {
    return null;
  }

  const candidate = segments[0];

  if (!candidate || RESERVED_SLUGS.has(candidate)) {
    return null;
  }

  if (segments.length === 2) {
    return null;
  }

  return candidate;
}
