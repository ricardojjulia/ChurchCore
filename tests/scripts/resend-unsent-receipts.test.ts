import { describe, expect, it } from "vitest";

import {
  emailProviderConfigured,
  main,
  parseArgs,
  targetHost,
} from "../../scripts/resend-unsent-receipts.mjs";

describe("resend-unsent-receipts script", () => {
  it("is a dry run unless --apply is passed", () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
    expect(() => parseArgs(["--appy"])).toThrow(/Unknown argument/);
  });

  it("knows when an email provider is configured", () => {
    expect(emailProviderConfigured({})).toBe(false);
    expect(emailProviderConfigured({ RESEND_API_KEY: "k" })).toBe(false);
    expect(emailProviderConfigured({ RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.c" })).toBe(true);
    expect(emailProviderConfigured({ SENDGRID_API_KEY: "k", SENDGRID_FROM_EMAIL: "a@b.c" })).toBe(true);
  });

  it("refuses to run, before touching the database, when no provider is configured", async () => {
    const lines: string[] = [];
    await expect(
      main(["--apply"], { TENANT_SUPABASE_URL: "https://x.supabase.co" } as unknown as NodeJS.ProcessEnv, (l: string) => lines.push(l)),
    ).rejects.toThrow(/Refusing to run/);
    expect(lines).toEqual([]);
  });

  it("prints only the host", () => {
    expect(targetHost({ TENANT_SUPABASE_URL: "https://abc.supabase.co/rest/v1?key=secret" })).toBe("abc.supabase.co");
    expect(() => targetHost({})).toThrow(/TENANT_SUPABASE_URL/);
  });
});
