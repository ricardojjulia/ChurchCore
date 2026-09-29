/**
 * The app's public base URL, for links sent outside the app (email, SMS).
 *
 * `NEXT_PUBLIC_APP_URL` when it's set (trailing slash dropped). Outside
 * production it falls back to the local dev server; in production it's null,
 * so callers skip the send rather than mail a dead localhost link
 * (Council Review 23).
 */
export function appBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? null : "http://localhost:4200";
}
