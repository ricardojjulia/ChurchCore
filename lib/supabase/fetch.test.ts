// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { supabaseFetch } from "@/lib/supabase/fetch";

// A real HTTP server that records which client socket (remote port) served
// each request, so these tests check what actually happens on the wire
// rather than which options were passed.
let server: Server;
let baseUrl: string;
let ports: number[] = [];

beforeAll(async () => {
  server = createServer((request, response) => {
    ports.push(request.socket.remotePort as number);
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ method: request.method, body }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  ports = [];
});

describe("supabaseFetch", () => {
  it("control: Node's default fetch reuses a keep-alive connection", async () => {
    for (let i = 0; i < 5; i += 1) await (await fetch(`${baseUrl}/rest/v1/x`)).text();
    expect(ports).toHaveLength(5);
    expect(new Set(ports).size).toBeLessThan(5);
  });

  it("opens a fresh connection for every request (#92's intent, now in effect)", async () => {
    for (let i = 0; i < 5; i += 1) await (await supabaseFetch(`${baseUrl}/rest/v1/x`)).text();
    expect(ports).toHaveLength(5);
    expect(new Set(ports).size).toBe(5);
  });

  it("behaves like fetch for supabase-js: URL inputs, JSON bodies, headers, json()", async () => {
    const response = await supabaseFetch(new URL("/rest/v1/rpc/f", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", apikey: "k" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual({ method: "POST", body: '{"a":1}' });
  });

  it("hands a Request object to the built-in fetch unchanged", async () => {
    const response = await supabaseFetch(new Request(`${baseUrl}/auth/v1/user`));
    expect(await response.json()).toEqual({ method: "GET", body: "" });
  });
});
