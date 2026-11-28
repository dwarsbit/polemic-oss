// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNewVersion,
  pageBuild,
  servedBuild,
  watchNewVersion,
} from "./new-version";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.head.innerHTML = "";
});

function watcherServing(...builds: (string | null | Error)[]) {
  const served = vi.fn(async () => {
    const next = builds.length > 1 ? builds.shift()! : builds[0];
    if (next instanceof Error) throw next;
    return next;
  });
  return { watcher: createNewVersion({ current: "aaa", served }), served };
}

describe("createNewVersion", () => {
  it("says nothing while the page's own build is served", async () => {
    const { watcher } = watcherServing("aaa");
    await watcher.check();
    expect(watcher.available()).toBe(false);
  });

  it("says a new version is available once another build is served", async () => {
    const { watcher } = watcherServing("bbb");
    const listener = vi.fn();
    watcher.subscribe(listener);
    await watcher.check();
    expect(watcher.available()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps what it knows when the file can't be read", async () => {
    const { watcher } = watcherServing("bbb", null, new Error("offline"));
    await watcher.check();
    await watcher.check();
    await watcher.check();
    expect(watcher.available()).toBe(true);
  });

  it("forgets the notice when the page's build is served again, as after a rollback", async () => {
    const { watcher } = watcherServing("bbb", "aaa");
    await watcher.check();
    await watcher.check();
    expect(watcher.available()).toBe(false);
  });

  it("hides it with Later until yet another build comes", async () => {
    const { watcher } = watcherServing("bbb", "bbb", "ccc");
    await watcher.check();
    watcher.later();
    expect(watcher.available()).toBe(false);
    await watcher.check();
    expect(watcher.available()).toBe(false);
    await watcher.check();
    expect(watcher.available()).toBe(true);
  });

  it("asks nothing without a build name of its own", async () => {
    const served = vi.fn(async () => "bbb");
    const watcher = createNewVersion({ current: null, served });
    watcher.start();
    await watcher.check();
    expect(served).not.toHaveBeenCalled();
    expect(watcher.available()).toBe(false);
  });

  it("asks every 15 minutes, and when the page comes back into view or online", async () => {
    vi.useFakeTimers();
    const { watcher, served } = watcherServing("aaa");
    watcher.start();
    expect(served).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    expect(served).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(served).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(served).toHaveBeenCalledTimes(3);
    watcher.stop();
    await vi.advanceTimersByTimeAsync(15 * 60_000);
    window.dispatchEvent(new Event("online"));
    expect(served).toHaveBeenCalledTimes(3);
  });
});

describe("reading the builds", () => {
  it("reads the page's build from its meta tag", () => {
    expect(pageBuild()).toBeNull();
    document.head.innerHTML = '<meta name="scholarkit-build" content="aaa">';
    expect(pageBuild()).toBe("aaa");
  });

  it("reads the served build past the caches", async () => {
    const fetch = vi.fn(async () => Response.json({ build: "bbb" }));
    vi.stubGlobal("fetch", fetch);
    expect(await servedBuild("/cursive/version.json")).toBe("bbb");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/cursive\/version\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");
  });

  it("reads no build from a missing or empty file", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    expect(await servedBuild("/version.json")).toBeNull();
    vi.stubGlobal("fetch", async () => Response.json({ build: null }));
    expect(await servedBuild("/version.json")).toBeNull();
  });

  it("watches the version file under the app's address", async () => {
    expect(watchNewVersion("/binder/")).toBeNull();
    document.head.innerHTML = '<meta name="scholarkit-build" content="aaa">';
    const fetch = vi.fn(async () => Response.json({ build: "bbb" }));
    vi.stubGlobal("fetch", fetch);
    const watcher = watchNewVersion("/binder/")!;
    await watcher.check();
    watcher.stop();
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(
      /^\/binder\/version\.json\?/,
    );
    expect(watcher.available()).toBe(true);
  });
});
