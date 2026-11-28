// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNewVersion } from "./new-version";
import { NewVersionCard, SAVE_WAIT_MS } from "./NewVersionCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  vi.useRealTimers();
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === label);

async function newVersionServed() {
  const watcher = createNewVersion({ current: "aaa", served: async () => "bbb" });
  await watcher.check();
  return watcher;
}

describe("NewVersionCard", () => {
  it("shows nothing while the page runs the version served", async () => {
    const watcher = createNewVersion({ current: "aaa", served: async () => "aaa" });
    await watcher.check();
    expect(render(<NewVersionCard watcher={watcher} />).textContent).toBe("");
  });

  it("appears when a new version is served, without reloading", async () => {
    const watcher = createNewVersion({ current: "aaa", served: async () => "bbb" });
    const reload = vi.fn();
    const page = render(<NewVersionCard watcher={watcher} reload={reload} />);
    expect(page.textContent).toBe("");
    await act(() => watcher.check());
    expect(page.textContent).toContain("A new version is available");
    expect(reload).not.toHaveBeenCalled();
  });

  it("saves first and then reloads", async () => {
    const order: string[] = [];
    const save = vi.fn(async () => void order.push("save"));
    const reload = vi.fn(() => void order.push("reload"));
    render(
      <NewVersionCard watcher={await newVersionServed()} save={save} reload={reload} />,
    );
    await act(async () => button("Load new version")!.click());
    expect(order).toEqual(["save", "reload"]);
  });

  it("doesn't reload when the work can't be saved", async () => {
    const reload = vi.fn();
    const page = render(
      <NewVersionCard
        watcher={await newVersionServed()}
        save={async () => {
          throw new Error("offline");
        }}
        reload={reload}
      />,
    );
    await act(async () => button("Load new version")!.click());
    expect(reload).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Your latest changes aren’t saved yet.");
    expect(button("Load new version")).toBeDefined();
  });

  it("gives up waiting for a save after 10 seconds", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const watcher = await newVersionServed();
    const page = render(
      <NewVersionCard
        watcher={watcher}
        save={() => new Promise(() => {})}
        reload={reload}
      />,
    );
    await act(async () => button("Load new version")!.click());
    expect(button("Saving…")?.disabled).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(SAVE_WAIT_MS));
    expect(reload).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Your latest changes aren’t saved yet.");
  });

  it("hides with Later", async () => {
    const page = render(<NewVersionCard watcher={await newVersionServed()} />);
    act(() => button("Later")!.click());
    expect(page.textContent).toBe("");
  });
});
