import { describe, expect, it } from "vitest";

import { jsonToCsv, neutralizeFormulaInjection } from "@/app/api/reports/custom/route";

describe("neutralizeFormulaInjection", () => {
  it.each(["=CMD('/c calc')", "+1+1", "-1+1", "@SUM(A1:A2)", "\ttab", "\rcr"])(
    "prefixes %s with a single quote so it is not treated as a formula",
    (dangerous) => {
      expect(neutralizeFormulaInjection(dangerous)).toBe(`'${dangerous}`);
    },
  );

  it("leaves ordinary values untouched", () => {
    expect(neutralizeFormulaInjection("Jane Doe")).toBe("Jane Doe");
    expect(neutralizeFormulaInjection("jane@example.com")).toBe("jane@example.com");
  });
});

describe("jsonToCsv", () => {
  it("neutralizes formula-injection-prone fields in exported rows", () => {
    const csv = jsonToCsv([
      { full_name: "=1+1", email: "attacker@example.com" },
    ]);

    expect(csv).toBe("full_name,email\n'=1+1,attacker@example.com");
  });

  it("still quotes commas and embedded quotes correctly", () => {
    const csv = jsonToCsv([{ note: 'Smith, "the" pastor' }]);
    expect(csv).toBe('note\n"Smith, ""the"" pastor"');
  });

  it("returns an empty string for no rows", () => {
    expect(jsonToCsv([])).toBe("");
  });
});
