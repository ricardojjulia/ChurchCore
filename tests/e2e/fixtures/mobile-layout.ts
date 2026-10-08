/**
 * Phone-first layout checks (G2.1), shared by the member mobile specs. Each
 * helper reads real computed boxes in the browser, so a regression to a 30px
 * button, a side-by-side card or a primary action below the fold fails here.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

export const MIN_TOUCH_PX = 44;
// Sub-pixel layout can report 43.9; anything below this is a real shortfall.
const TOUCH_TOLERANCE_PX = 43.5;

export type TouchViolation = { selector: string; text: string; w: number; h: number };

const INTERACTIVE =
  "a[href], button, [role=button], [role=link], input:not([type=hidden]), select, textarea, [role=tab], [role=switch], [role=checkbox]";

/**
 * Every interactive element inside <main> that is rendered and smaller than
 * 44x44 CSS px. Inline text links inside a sentence are exempt (WCAG 2.5.8),
 * and a checkbox, radio or switch input is measured by its label.
 */
export async function collectTouchViolations(page: Page, root?: Locator): Promise<TouchViolation[]> {
  await page.waitForLoadState("networkidle");
  // Default: the page's <main>. Pass a locator such as page.getByRole("dialog") to
  // scope the check to an open modal or drawer, which renders outside <main>.
  const scope = root ?? page.locator("main").first();
  return scope.evaluate(
    (rootEl, { selector, min }) => {
      const out: { selector: string; text: string; w: number; h: number }[] = [];
      const describe = (el: Element) => {
        const id = el.id ? `#${el.id}` : "";
        const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter((c) => c.startsWith("mantine-")).slice(0, 1) : [];
        return `${el.tagName.toLowerCase()}${id}${cls.length ? `.${cls[0]}` : ""}`;
      };
      for (const el of Array.from(rootEl.querySelectorAll(selector))) {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (el.closest("[hidden], [aria-hidden=true]") && !el.closest("a, button")) continue;

        // A checkbox, radio or switch is operated through its label, which is part of the
        // tap target, so measure that when there is one.
        let target: Element = el;
        if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)) {
          target = el.labels?.[0] ?? el.closest("label") ?? el;
        }
        if (el.tagName === "A" && style.display === "inline" && !el.closest(".mantine-Button-root, .mantine-UnstyledButton-root") && !el.classList.contains("mantine-Button-root")) {
          continue;
        }
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < min || rect.height < min) {
          out.push({
            selector: describe(target),
            text: (target.textContent ?? "").trim().slice(0, 40) || (el.getAttribute("aria-label") ?? ""),
            w: Math.round(rect.width * 10) / 10,
            h: Math.round(rect.height * 10) / 10,
          });
        }
      }
      return out;
    },
    { selector: INTERACTIVE, min: TOUCH_TOLERANCE_PX },
  );
}

/** No horizontal scroll: the page is no wider than the viewport (plus a pixel). */
export async function expectNoHorizontalOverflow(page: Page) {
  await page.waitForLoadState("networkidle");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `page is ${scrollWidth}px wide in a ${innerWidth}px viewport`).toBeLessThanOrEqual(innerWidth + 1);
}

/**
 * Top-level content cards (a Paper in <main> with no Paper ancestor) stack in
 * one column: no two share vertical space while sitting apart horizontally.
 * Buttons that are drawn inside a Paper (the home quick actions) are not cards.
 */
export async function findSideBySideCards(page: Page): Promise<string[]> {
  await page.waitForLoadState("networkidle");
  return page.evaluate(() => {
    const papers = Array.from(document.querySelectorAll("main .mantine-Paper-root")).filter(
      (el) => !el.parentElement?.closest(".mantine-Paper-root"),
    );
    const boxes = papers
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.height > 0);
    const pairs: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const yOverlap = a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const xDisjoint = a.right <= b.left + 1 || b.right <= a.left + 1;
        if (yOverlap && xDisjoint) {
          pairs.push(`${(boxes[i].el.textContent ?? "").trim().slice(0, 24)} | ${(boxes[j].el.textContent ?? "").trim().slice(0, 24)}`);
        }
      }
    }
    return pairs;
  });
}

/**
 * The page's first [data-primary-action] sits fully inside the first screen:
 * below the header, above the bottom nav, with no scrolling.
 */
export async function expectPrimaryActionInFirstScreen(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  const primary = page.locator("[data-primary-action]:visible").first();
  await expect(primary, "page has a visible [data-primary-action]").toBeVisible();
  const box = await primary.boundingBox();
  if (!box) throw new Error("primary action has no box");
  const headerBottom = await page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
  const footerTop = await page.evaluate(() => document.querySelector("footer")?.getBoundingClientRect().top ?? window.innerHeight);
  expect(box.y, "primary action starts below the header").toBeGreaterThanOrEqual(headerBottom - 0.5);
  expect(box.y + box.height, "primary action ends above the bottom nav").toBeLessThanOrEqual(footerTop + 0.5);
  expect(box.height).toBeGreaterThanOrEqual(TOUCH_TOLERANCE_PX);
}

/**
 * The bottom nav: five items, each at least 44px tall, and exactly one current
 * page. Pass `hasCurrentItem: false` for a page the nav has no item for (giving).
 */
export async function expectBottomNavTouchable(page: Page, { hasCurrentItem = true }: { hasCurrentItem?: boolean } = {}) {
  const links = page.locator("footer a");
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    const box = await link.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_PX - 0.5);
  }
  await expect(page.locator("footer a[aria-current='page']")).toHaveCount(hasCurrentItem ? 1 : 0);
}
