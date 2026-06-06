import "server-only";

// Node.js 18+ (undici) reuses HTTP/2 connections across serverless invocations.
// When Supabase closes an idle connection the next request fails with
// "Connection closed". Injecting a dispatcher with keepAlive disabled forces
// a fresh TCP connection per request, which is slower but reliable in
// short-lived serverless contexts like Vercel.
let dispatcher: unknown;

function getDispatcher() {
  if (!dispatcher) {
    try {
      // undici is built into Node.js 18+ and available in the Vercel runtime.
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
      const undici = require("undici") as any;
      dispatcher = new undici.Agent({ connect: { keepAlive: false } });
    } catch {
      // Not available (e.g. Edge runtime) — fall back to default fetch.
    }
  }
  return dispatcher;
}

export function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const d = getDispatcher();
  if (!d) return fetch(input, init);
  // The `dispatcher` option is Node.js-specific (undici); TypeScript doesn't
  // know about it so we cast.
  return fetch(input, { ...init, dispatcher: d } as RequestInit);
}
