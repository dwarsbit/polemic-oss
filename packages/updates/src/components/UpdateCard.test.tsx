// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdater, type FoundUpdate } from "../updates";
import { UpdateCard } from "./UpdateCard";
import { UpdatesSettings } from "./UpdatesSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
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

function updaterWith(update: FoundUpdate | null, install = vi.fn(async () => {})) {
  return createUpdater({
    currentVersion: async () => "0.3.0",
    check: async () => (update ? { ...update, install } : null),
    relaunch: vi.fn(async () => {}),
    storage: null,
  });
}

const update: FoundUpdate = {
  version: "0.4.0",
  notes: "### Added\n\n- Export to **PowerPoint**.",
  date: "2026-11-28T10:00:00Z",
  download: async () => {},
  install: async () => {},
};

describe("UpdateCard", () => {
  it("shows nothing until an update is downloaded", async () => {
    const updater = updaterWith(update);
    const view = render(
      <UpdateCard
        updater={updater}
        app="Cursive"
        downloadUrl="https://x"
        openUrl={() => {}}
      />,
    );
    expect(view.textContent).toBe("");
    await act(() => updater.check());
    expect(view.textContent).toContain("Update ready");
    expect(view.textContent).toContain("Cursive 0.4.0 is downloaded.");
  });

  it("installs on Restart now and hides on Later", async () => {
    const install = vi.fn(async () => {});
    const updater = updaterWith(update, install);
    const view = render(
      <UpdateCard
        updater={updater}
        app="Cursive"
        downloadUrl="https://x"
        openUrl={() => {}}
      />,
    );
    await act(() => updater.check());
    act(() => button("Later")!.click());
    expect(view.textContent).toBe("");
    await act(() => updater.check({ manual: true }));
    await act(async () => button("Restart now")!.click());
    expect(install).toHaveBeenCalled();
  });

  it("shows the notes in What's new", async () => {
    const updater = updaterWith(update);
    render(
      <UpdateCard
        updater={updater}
        app="Binder"
        downloadUrl="https://x"
        openUrl={() => {}}
      />,
    );
    await act(() => updater.check());
    act(() => button("What’s new")!.click());
    const dialog = document.querySelector("dialog")!;
    expect(dialog.textContent).toContain("What’s new in Binder 0.4.0");
    expect(dialog.textContent).toContain("You have 0.3.0.");
    expect(dialog.querySelector("strong")?.textContent).toBe("PowerPoint");
  });

  it("offers the download page when installing fails", async () => {
    const openUrl = vi.fn();
    const updater = updaterWith(
      update,
      vi.fn(async () => Promise.reject(new Error("x"))),
    );
    const view = render(
      <UpdateCard
        updater={updater}
        app="Polemic"
        downloadUrl="https://scholarkit.app/download"
        openUrl={openUrl}
      />,
    );
    await act(() => updater.check());
    await act(async () => button("Restart now")!.click());
    expect(view.textContent).toContain("Update not installed");
    act(() => button("Download")!.click());
    expect(openUrl).toHaveBeenCalledWith("https://scholarkit.app/download");
  });
});

describe("UpdatesSettings", () => {
  it("checks when asked and says the version is the latest", async () => {
    const updater = updaterWith(null);
    const view = render(<UpdatesSettings updater={updater} app="Cursive" />);
    await act(async () => {});
    expect(view.textContent).toContain("Cursive 0.3.0");
    expect(view.textContent).toContain("Not checked yet.");
    await act(async () => button("Check now")!.click());
    expect(view.textContent).toContain("You have the latest version. Checked today at");
  });

  it("turns the automatic check off", () => {
    const updater = updaterWith(null);
    const view = render(<UpdatesSettings updater={updater} app="Cursive" />);
    act(() => view.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    expect(updater.state().auto).toBe(false);
  });
});
