import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesSetMock } = vi.hoisted(() => {
  const cookiesSet = vi.fn();
  return { cookiesSetMock: cookiesSet };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookiesSetMock })),
}));

import { setLocaleAction } from "@/app/language-actions";
import { defaultLocale, localeCookieName } from "@/lib/i18n";

describe("setLocaleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes and persists a supported locale", async () => {
    await setLocaleAction("es-PR");

    expect(cookiesSetMock).toHaveBeenCalledWith(
      localeCookieName,
      "es-PR",
      expect.objectContaining({
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("falls back to a default locale for unsupported input", async () => {
    await setLocaleAction("not-a-real-locale");

    expect(cookiesSetMock).toHaveBeenCalledWith(
      localeCookieName,
      defaultLocale,
      expect.any(Object),
    );
  });
});
