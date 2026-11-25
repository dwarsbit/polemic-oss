// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu, type AccountMenuProps } from "./AccountMenu";
import {
  formatBytes,
  initialsOf,
  planName,
  upgradeFrom,
  type AccountUsage,
} from "./format";
import { formatNumber, t } from "@scholarkit/i18n";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
});

const ada = { name: "Ada Lovelace", email: "ada@example.com" };

const free: AccountUsage = {
  plan: "free",
  storage: { usedBytes: 42_500, limitBytes: 100_000_000 },
  compile: { usedPercent: 1, resetsAt: "2026-11-26T00:00:00.000Z" },
  reviewLinks: { count: 1, limit: 1 },
};

async function render(props: Partial<AccountMenuProps> = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const all: AccountMenuProps = {
    account: ada,
    onManage: vi.fn(),
    onSignOut: vi.fn(),
    ...props,
  };
  await act(async () => root!.render(<AccountMenu {...all} />));
  return all;
}

const trigger = () => host!.querySelector<HTMLButtonElement>("button")!;
const menu = () => host!.querySelector('[role="menu"]');
const text = () => menu()?.textContent ?? "";
const item = (label: string) =>
  [...host!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (i) => i.textContent?.trim() === label,
  );

async function open() {
  await act(async () => trigger().click());
}

describe("AccountMenu", () => {
  it("shows who is signed in, the plan and the usage", async () => {
    const loadUsage = vi.fn(async () => free);
    await render({ loadUsage });
    expect(menu()).toBeNull();
    expect(trigger().textContent).toBe("AL");
    await open();
    expect(loadUsage).toHaveBeenCalledOnce();
    expect(text()).toContain("Ada Lovelace");
    expect(text()).toContain("ada@example.com");
    expect(host!.querySelector(".account-menu-plan")?.textContent).toBe("Free");
    expect(text()).toContain("42.5 KB of 100 MB");
    expect(text()).toContain("1% used");
    expect(text()).toContain("1 of 1 active review link");
  });

  it("fetches the usage again each time it opens", async () => {
    const loadUsage = vi.fn(async () => free);
    await render({ loadUsage });
    await open();
    await open();
    await open();
    expect(loadUsage).toHaveBeenCalledTimes(2);
  });

  it("says when a limit is reached", async () => {
    await render({
      loadUsage: async () => ({
        ...free,
        compile: { usedPercent: 100 },
        storage: { usedBytes: 5e9, limitBytes: 5e9 },
      }),
    });
    await open();
    expect(host!.querySelectorAll(".account-menu-meter[data-full]")).toHaveLength(2);
    expect(text()).toContain("More from midnight UTC");
  });

  it("offers the next plan on Free and Plus, and nothing on Pro", async () => {
    const onUpgrade = vi.fn();
    await render({ plan: "free", onUpgrade });
    await open();
    expect(item("Upgrade to Plus")).toBeTruthy();
    await act(async () => item("Upgrade to Plus")!.click());
    expect(onUpgrade).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();

    act(() => root?.unmount());
    await render({ plan: "plus", onUpgrade });
    await open();
    expect(item("Upgrade to Pro")).toBeTruthy();

    act(() => root?.unmount());
    await render({
      plan: "plus",
      onUpgrade,
      loadUsage: async () => ({
        ...free,
        plan: "pro",
        reviewLinks: { count: 9, limit: null },
      }),
    });
    await open();
    expect(text()).toContain("Unlimited review links");
    expect(text()).not.toContain("Upgrade");
    expect(host!.querySelector(".account-menu-plan")?.textContent).toBe("Pro");
  });

  it("has no upgrade row without a way to upgrade", async () => {
    await render({ plan: "free" });
    await open();
    expect(text()).not.toContain("Upgrade");
  });

  it("works without the usage when it can't be fetched", async () => {
    await render({
      plan: "free",
      loadUsage: async () => {
        throw new Error("offline");
      },
    });
    await open();
    expect(text()).toContain("Ada Lovelace");
    expect(host!.querySelector(".account-menu-usage")).toBeNull();
    expect(item("Manage account")).toBeTruthy();
  });

  it("runs the app's own rows, and says why one failed", async () => {
    const run = vi.fn(async () => {
      throw new Error("The server can't be reached.");
    });
    await render({
      note: "This project is only on this computer.",
      actions: [{ label: "Sync this project to your account", icon: null, run }],
    });
    await open();
    expect(text()).toContain("This project is only on this computer.");
    await act(async () => item("Sync this project to your account")!.click());
    expect(run).toHaveBeenCalledOnce();
    expect(menu()).not.toBeNull();
    expect(host!.querySelector('[role="alert"]')?.textContent).toBe(
      "The server can't be reached.",
    );
  });

  it("opens the account page and signs out", async () => {
    const props = await render({ external: true });
    await open();
    expect(item("Manage account")!.querySelector("svg + span + svg")).not.toBeNull();
    await act(async () => item("Manage account")!.click());
    expect(props.onManage).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    await open();
    await act(async () => item("Sign out")!.click());
    expect(props.onSignOut).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
  });

  it("closes on Escape and on a click outside", async () => {
    await render();
    await open();
    await act(async () => {
      menu()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    await open();
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(menu()).toBeNull();
  });

  it("moves between the rows with the arrow keys", async () => {
    await render({ plan: "free", onUpgrade: vi.fn() });
    await open();
    const key = (k: string) =>
      act(async () => {
        menu()!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      });
    await key("ArrowDown");
    expect(document.activeElement).toBe(item("Upgrade to Plus"));
    await key("ArrowDown");
    expect(document.activeElement).toBe(item("Manage account"));
    await key("ArrowUp");
    await key("ArrowUp");
    expect(document.activeElement).toBe(item("Sign out"));
  });

  it("shows the photo, or a person without a name", async () => {
    await render({ account: { ...ada, photo: "data:image/png;base64,AA==" } });
    expect(trigger().querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,AA==",
    );
    act(() => root?.unmount());
    await render({ account: null });
    expect(trigger().querySelector("svg")).not.toBeNull();
    expect(trigger().title).toBe("Scholarkit account");
  });

  it("sits in a row with the name at the foot of a list", async () => {
    await render({ place: "row" });
    expect(trigger().className).toBe("account-menu-row");
    expect(trigger().textContent).toContain("Ada Lovelace");
  });

  it("takes a page's own translator", async () => {
    const translator = {
      t: (message: string, values?: Record<string, unknown>) =>
        message === "Manage account" ? "Account beheren" : t(message, values as never),
      tn: (n: number, one: string, other: string, values?: Record<string, unknown>) =>
        (n === 1 ? one : other)
          .replace("{active}", String(values?.active))
          .replace("{count}", String(n)),
      formatNumber,
    };
    await render({ translator });
    await open();
    expect(item("Account beheren")).toBeTruthy();
  });
});

describe("format", () => {
  const tr = { t, formatNumber };
  it("writes bytes as the plans give them", () => {
    expect(formatBytes(0, tr)).toBe("0 B");
    expect(formatBytes(42_500, tr)).toBe("42.5 KB");
    expect(formatBytes(100_000_000, tr)).toBe("100 MB");
    expect(formatBytes(1_234_000_000, tr)).toBe("1.2 GB");
  });

  it("names the plans, old ones too", () => {
    expect(planName("free", tr)).toBe("Free");
    expect(planName("professional", tr)).toBe("Pro");
    expect(planName("ultimate", tr)).toBe("Ultimate");
  });

  it("upgrades Free to Plus and Plus to Pro", () => {
    expect(upgradeFrom("free")).toBe("plus");
    expect(upgradeFrom("plus")).toBe("pro");
    expect(upgradeFrom("pro")).toBeNull();
    expect(upgradeFrom("student")).toBeNull();
    expect(upgradeFrom(null)).toBeNull();
  });

  it("takes first and last initials", () => {
    expect(initialsOf("Anna de Vries")).toBe("AV");
    expect(initialsOf("Leon van der Grient")).toBe("LG");
    expect(initialsOf("ada")).toBe("A");
  });
});
