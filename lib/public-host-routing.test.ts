import { describe, expect, it } from "vitest";

import { extractPublicChurchSlugFromHost } from "@/lib/public-host-routing";

describe("public host routing", () => {
  it("extracts tenant slugs from subdomains", () => {
    expect(extractPublicChurchSlugFromHost("graceharbor.churchforge.com")).toBe("graceharbor");
    expect(extractPublicChurchSlugFromHost("newcity.example.org")).toBe("newcity");
  });

  it("ignores localhost and reserved hosts", () => {
    expect(extractPublicChurchSlugFromHost("localhost:3000")).toBeNull();
    expect(extractPublicChurchSlugFromHost("www.churchforge.com")).toBeNull();
    expect(extractPublicChurchSlugFromHost("app.churchforge.com")).toBeNull();
  });
});
