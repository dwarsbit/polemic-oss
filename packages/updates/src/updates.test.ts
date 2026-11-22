import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_KEY,
  CHECKED_KEY,
  DAY_MS,
  HOUR_MS,
  START_DELAY_MS,
  createUpdater,
  type FoundUpdate,
  type UpdaterDeps,
} from "./updates";

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

function found(version = "0.4.0", overrides: Partial<FoundUpdate> = {}): FoundUpdate {
  return {
    version,
    notes: "- Export to PowerPoint.",
    date: "2026-11-28T10:00:00Z",
    download: vi.fn(async (onProgress) => {
      onProgress(0.5);
      onProgress(1);
    }),
    install: vi.fn(async () => {}),
    ...overrides,
  };
}

function setup(overrides: Partial<UpdaterDeps> = {}) {
  let time = Date.UTC(2026, 10, 22, 9);
  const storage = memoryStorage();
  const deps = {
    currentVersion: vi.fn(async () => "0.3.0"),
    check: vi.fn(async (): Promise<FoundUpdate | null> => null),
    relaunch: vi.fn(async () => {}),
    beforeRestart: vi.fn(async () => {}),
    storage,
    now: () => time,
    ...overrides,
  } satisfies UpdaterDeps;
  const updater = createUpdater(deps);
  return {
    updater,
    deps,
    storage: deps.storage as ReturnType<typeof memoryStorage>,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createUpdater", () => {
  it("reads the installed version and the setting", async () => {
    const { updater } = setup({ storage: memoryStorage({ [AUTO_KEY]: "false" }) });
    await vi.waitFor(() => expect(updater.state().current).toBe("0.3.0"));
    expect(updater.state().auto).toBe(false);
  });

  it("checks automatically unless it was turned off", () => {
    expect(setup().updater.state().auto).toBe(true);
  });

  it("stays idle and records the time when there is no update", async () => {
    const { updater, storage } = setup();
    await updater.check();
    expect(updater.state()).toMatchObject({ phase: "idle", update: null });
    expect(updater.state().checkedAt).toBe(Date.UTC(2026, 10, 22, 9));
    expect(storage.items.get(CHECKED_KEY)).toBe(String(Date.UTC(2026, 10, 22, 9)));
  });

  it("downloads a new version and is ready", async () => {
    const update = found();
    const { updater } = setup({ check: vi.fn(async () => update) });
    const progress: (number | null)[] = [];
    updater.subscribe(() => progress.push(updater.state().progress));
    await updater.check();
    expect(update.download).toHaveBeenCalled();
    expect(updater.state()).toMatchObject({
      phase: "ready",
      update: { version: "0.4.0", notes: "- Export to PowerPoint." },
    });
    expect(progress).toContain(0.5);
    expect(update.install).not.toHaveBeenCalled();
  });

  it("restarts only when asked: saves, installs, then relaunches", async () => {
    const order: string[] = [];
    const update = found("0.4.0", {
      install: vi.fn(async () => void order.push("install")),
    });
    const { updater, deps } = setup({
      check: vi.fn(async () => update),
      beforeRestart: vi.fn(async () => void order.push("save")),
      relaunch: vi.fn(async () => void order.push("relaunch")),
    });
    await updater.check();
    expect(deps.relaunch).not.toHaveBeenCalled();
    await updater.restart();
    expect(order).toEqual(["save", "install", "relaunch"]);
  });

  it("says so when installing fails", async () => {
    const update = found("0.4.0", {
      install: vi.fn(async () => Promise.reject(new Error("no"))),
    });
    const { updater, deps } = setup({ check: vi.fn(async () => update) });
    await updater.check();
    await updater.restart();
    expect(updater.state().phase).toBe("install-failed");
    expect(deps.relaunch).not.toHaveBeenCalled();
  });

  it("keeps a failed automatic check quiet, and shows one someone asked for", async () => {
    const { updater } = setup({
      check: vi.fn(async () => Promise.reject(new Error("offline"))),
    });
    await updater.check();
    expect(updater.state().phase).toBe("idle");
    await updater.check({ manual: true });
    expect(updater.state().phase).toBe("check-failed");
  });

  it("drops a download that fails in the background, to try again later", async () => {
    const update = found("0.4.0", {
      download: vi.fn(async () => Promise.reject(new Error("x"))),
    });
    const { updater } = setup({ check: vi.fn(async () => update) });
    await updater.check();
    expect(updater.state()).toMatchObject({ phase: "idle", update: null });
  });

  it("hides the card with Later, and shows it again on Check now", async () => {
    const update = found();
    const { updater, deps } = setup({ check: vi.fn(async () => update) });
    await updater.check();
    updater.later();
    expect(updater.state()).toMatchObject({ phase: "ready", dismissed: true });
    await updater.check({ manual: true });
    expect(updater.state().dismissed).toBe(false);
    // The version is on the disk already: no second check or download.
    expect(deps.check).toHaveBeenCalledTimes(1);
  });

  it("keeps the setting", () => {
    const { updater, storage } = setup();
    updater.setAuto(false);
    expect(updater.state().auto).toBe(false);
    expect(storage.items.get(AUTO_KEY)).toBe("false");
  });
});

describe("the schedule", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("checks soon after the start, then once a day", async () => {
    const { updater, deps, advance } = setup();
    const stop = updater.start();
    expect(deps.check).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(START_DELAY_MS);
    expect(deps.check).toHaveBeenCalledTimes(1);

    // An hour later a day hasn't passed yet.
    advance(HOUR_MS);
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(deps.check).toHaveBeenCalledTimes(1);

    advance(DAY_MS);
    await vi.advanceTimersByTimeAsync(HOUR_MS);
    expect(deps.check).toHaveBeenCalledTimes(2);
    stop();
  });

  it("doesn't check when the setting is off", async () => {
    const { updater, deps, advance } = setup({
      storage: memoryStorage({ [AUTO_KEY]: "false" }),
    });
    const stop = updater.start();
    advance(2 * DAY_MS);
    await vi.advanceTimersByTimeAsync(2 * DAY_MS);
    expect(deps.check).not.toHaveBeenCalled();
    stop();
  });
});
