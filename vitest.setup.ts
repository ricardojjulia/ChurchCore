import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
	cleanup();
});

// Browser shims, for the jsdom environment only (some suites run in node).
if (typeof window !== "undefined") {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});
}

// jsdom has no ResizeObserver; Mantine 9.6's ScrollArea observes on mount.
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
	Object.defineProperty(window, "ResizeObserver", { writable: true, configurable: true, value: ResizeObserverStub });
	Object.defineProperty(globalThis, "ResizeObserver", { writable: true, configurable: true, value: ResizeObserverStub });
}
