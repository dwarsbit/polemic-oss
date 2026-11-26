import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

const saves: string[] = [];
/** Saves are refused, as when the file on disk changed meanwhile. */
let refuse = false;

vi.mock("@/store/editor", () => ({
  useEditorStore: create(() => ({ content: "", docVersion: 0 })),
}));

vi.mock("@/store/project", async () => {
  const { useEditorStore } = await import("@/store/editor");
  const store = create<{
    project: { path: string; readOnly?: string | null } | null;
    lastSavedContent: string | null;
    flushBuffers: () => Promise<void>;
    saveActiveFile: () => Promise<boolean>;
  }>((set) => ({
    project: { path: "/p" },
    lastSavedContent: "",
    flushBuffers: async () => {},
    saveActiveFile: async () => {
      if (refuse) return false;
      const content = useEditorStore.getState().content;
      saves.push(content);
      set({ lastSavedContent: content });
      return true;
    },
  }));
  return { useProjectStore: store };
});

const { useEditorStore } = await import("@/store/editor");
const { useProjectStore } = await import("@/store/project");
const { saveAsYouType } = await import("./save-as-you-type");

const type = (content: string) => useEditorStore.setState({ content });

describe("saveAsYouType", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saves.length = 0;
    useEditorStore.setState({ content: "", docVersion: 0 });
    useProjectStore.setState({ lastSavedContent: "" });
    refuse = false;
  });
  afterEach(() => vi.useRealTimers());

  it("saves a burst of edits once, after a short pause", async () => {
    const saving = saveAsYouType(() => true, 200);
    type("a");
    type("ab");
    expect(saving.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(199);
    expect(saves).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saves).toEqual(["ab"]);
    expect(saving.pending()).toBe(false);
    saving.stop();
  });

  it("still saves while you type without a pause", async () => {
    const saving = saveAsYouType(() => true, 200);
    for (let i = 1; i <= 10; i++) {
      type("x".repeat(i));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(saves.length).toBeGreaterThanOrEqual(1);
    saving.stop();
  });

  it("does nothing while it is off, or for a file that was loaded", async () => {
    let on = false;
    const saving = saveAsYouType(() => on, 100);
    type("mine");
    await vi.advanceTimersByTimeAsync(500);
    expect(saves).toEqual([]);
    on = true;
    useEditorStore.setState({ content: "loaded", docVersion: 1 });
    await vi.advanceTimersByTimeAsync(500);
    expect(saves).toEqual([]);
    saving.stop();
  });

  it("tries a refused save again", async () => {
    const saving = saveAsYouType(() => true, 100);
    refuse = true;
    type("mine");
    await vi.advanceTimersByTimeAsync(100);
    expect(saves).toEqual([]);
    refuse = false;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(saves).toEqual(["mine"]);
    saving.stop();
  });
});
