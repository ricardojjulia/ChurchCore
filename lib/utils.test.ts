import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-2", "text-sm", "px-4")).toBe("text-sm px-4");
  });

  it("filters falsey class values", () => {
    expect(cn("rounded", false && "hidden", null, undefined, "shadow")).toBe(
      "rounded shadow",
    );
  });
});