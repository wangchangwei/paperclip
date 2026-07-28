// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "./LocaleSwitcher";

const mockChangeLocale = vi.hoisted(() => vi.fn());
const mockLocale = vi.hoisted(() => ({ value: "en" as string | null }));

vi.mock("@/hooks/useLocalePreference", () => ({
  useLocalePreference: () => ({
    locale: mockLocale.value,
    changeLocale: mockChangeLocale,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("LocaleSwitcher", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockLocale.value = "en";
    mockChangeLocale.mockClear();
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("renders an icon button by default", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LocaleSwitcher />);
    });
    await flushReact();

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Switch language");

    await act(async () => root.unmount());
  });

  it("renders a menu-action row when variant='menu-action'", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LocaleSwitcher variant="menu-action" />);
    });
    await flushReact();

    expect(container.textContent).toContain("Language");
    expect(container.textContent).toContain("Switch UI language.");

    await act(async () => root.unmount());
  });

  it("shows locale options when the popover is opened", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LocaleSwitcher />);
    });
    await flushReact();

    const trigger = container.querySelector("button[aria-label='Switch language']") as HTMLButtonElement | null;
    await act(async () => {
      trigger?.click();
    });
    await flushReact();

    // Options should appear in the popover
    expect(container.textContent).toContain("简体中文");
    expect(container.textContent).toContain("English");

    await act(async () => root.unmount());
  });

  it("calls changeLocale when a locale is selected", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LocaleSwitcher />);
    });
    await flushReact();

    const trigger = container.querySelector("button[aria-label='Switch language']") as HTMLButtonElement | null;
    await act(async () => {
      trigger?.click();
    });
    await flushReact();

    const zhButton = container.querySelector("button[aria-label='简体中文']") as HTMLButtonElement | null;
    await act(async () => {
      zhButton?.click();
    });
    await flushReact();

    expect(mockChangeLocale).toHaveBeenCalledWith("zh-CN");

    await act(async () => root.unmount());
  });
});
