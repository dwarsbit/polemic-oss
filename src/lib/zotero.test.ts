import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));

import { KEPT_KEY } from "./tauri";
import { zoteroWebSearch, zoteroWebValidateKey } from "./zotero";

afterEach(() => {
  vi.unstubAllGlobals();
  invoke.mockReset();
});

describe("Zotero cloud requests", () => {
  it("send a kept key's requests through the app, never with the key", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    invoke.mockResolvedValue(JSON.stringify([{ data: { key: "A", title: "Paper" } }]));
    const items = await zoteroWebSearch("survey", null, {
      id: "z1",
      userId: "42",
      apiKey: KEPT_KEY,
    });
    expect(items).toEqual([{ key: "A", title: "Paper" }]);
    expect(invoke).toHaveBeenCalledWith("zotero_cloud_fetch", {
      sourceId: "z1",
      path: "items",
      query: "format=json&limit=50&q=survey",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("send a typed key straight to Zotero", async () => {
    const fetch = vi.fn(async () => Response.json({ userID: 42, username: "ada" }));
    vi.stubGlobal("fetch", fetch);
    expect(await zoteroWebValidateKey(" typed-key ")).toEqual({
      userID: "42",
      username: "ada",
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.zotero.org/keys/current");
    expect((init.headers as Record<string, string>)["Zotero-API-Key"]).toBe(
      "typed-key",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("check a kept key through the app", async () => {
    invoke.mockResolvedValue(JSON.stringify({ userID: 42, username: "ada" }));
    expect(await zoteroWebValidateKey(KEPT_KEY, "z1")).toEqual({
      userID: "42",
      username: "ada",
    });
    expect(invoke).toHaveBeenCalledWith("zotero_cloud_fetch", {
      sourceId: "z1",
      path: "keys/current",
      query: "",
    });
  });
});
