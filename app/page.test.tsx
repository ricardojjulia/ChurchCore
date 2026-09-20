import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/language-actions", () => ({
  setLocaleAction: vi.fn(),
}));

import Home from "@/app/page";
import { I18nProvider } from "@/components/i18n-provider";

function renderHome() {
  return render(
    <MantineProvider>
      <I18nProvider locale="en">
        <Home />
      </I18nProvider>
    </MantineProvider>,
  );
}

describe("public home page", () => {
  it("renders the hero headline", () => {
    renderHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Run the Ministry.Strengthen the People.Advance the Mission.",
    );
  });

  it("keeps the sign-in and control links pointed at their existing hrefs", () => {
    renderHome();

    const signInLinks = screen.getAllByRole("link", { name: "Sign in" });
    expect(signInLinks.length).toBeGreaterThan(0);
    signInLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "/sign-in");
    });

    expect(screen.getByRole("link", { name: "Control" })).toHaveAttribute(
      "href",
      "/sign-in?redirectTo=/control&force=1",
    );
  });

  it("links the primary hero CTA to /sign-in", () => {
    renderHome();

    expect(
      screen.getByRole("link", { name: /get started free/i }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("renders all six feature card titles", () => {
    renderHome();

    [
      "Know Your People",
      "Organize Groups & Teams",
      "Mobilize Volunteers",
      "Plan Events & Engagement",
      "Communicate with Purpose",
      "Ministry Workflows",
    ].forEach((title) => {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });
  });

  it("renders all four ecosystem card names", () => {
    renderHome();

    ["Church Core", "Church Academy", "Church LMS", "Church Care"].forEach(
      (name) => {
        expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      },
    );
  });
});
