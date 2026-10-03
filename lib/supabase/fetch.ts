import "server-only";

import { Agent, fetch as undiciFetch } from "undici";

// Warm serverless invocations (Vercel) reuse pooled keep-alive connections.
// When Supabase has already closed an idle one, the next request on it fails
// with "Connection closed" / "other side closed" — which made the sign-in
// action appear to do nothing (#92). This agent opens a fresh connection per
// request (`pipelining: 0` disables keep-alive in undici): slower, reliable.
//
// #92 never took effect: it `require`d "undici" without it being a dependency
// (Node's built-in copy isn't importable), so it silently fell back to the
// default fetch, and its `connect: { keepAlive: false }` only turns off TCP
// keep-alive probes, not connection reuse. undici's own `fetch` is used with
// its own Agent, so the agent never crosses into Node's bundled undici
// version.
const freshConnectionPerRequest = new Agent({ pipelining: 0 });

export function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // supabase-js calls with a URL string and a string body. A Request object
  // belongs to Node's built-in fetch, so it goes there unchanged.
  if (typeof input !== "string" && !(input instanceof URL)) {
    return fetch(input, init);
  }
  // undici's Response is the same Fetch API shape supabase-js consumes.
  return undiciFetch(input, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: freshConnectionPerRequest,
  }) as unknown as Promise<Response>;
}
