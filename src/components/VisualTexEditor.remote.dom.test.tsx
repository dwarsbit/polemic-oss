// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { VisualTexEditor } from "@/components/VisualTexEditor";
import { applyRemoteContent } from "@/lib/editor-edits";
import { useEditorStore } from "@/store/editor";
import { usePresenceStore } from "@/store/presence";
import { useProjectStore } from "@/store/project";

const TEX = `\\documentclass{article}
\\begin{document}
\\section{Intro}
First paragraph.

Second paragraph.
\\end{document}
`;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });

describe("VisualTexEditor, working together", () => {
  it("brings in someone else's change without reloading, and shows where they are", async () => {
    useProjectStore.setState({ activeFile: "main.tex" });
    useEditorStore.getState().loadContent(TEX);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<VisualTexEditor />);
    });
    await settle();
    const version = useEditorStore.getState().docVersion;

    const changed = TEX.replace("Second paragraph.", "Second paragraph, longer.");
    let taken = false;
    await act(async () => {
      taken = applyRemoteContent(changed);
    });
    expect(taken).toBe(true);
    expect(useEditorStore.getState().content).toBe(changed);
    // Brought in where it changed, not reloaded.
    expect(useEditorStore.getState().docVersion).toBe(version);
    expect(host.textContent).toContain("Second paragraph, longer.");
    await settle();
    // Taking it in doesn't rewrite the file as the face would write it.
    expect(useEditorStore.getState().content).toBe(changed);

    const offset = changed.indexOf("Second");
    await act(async () => {
      usePresenceStore.setState({
        peers: [
          {
            clientId: 7,
            userId: "anna",
            name: "Anna de Vries",
            color: "#1971c2",
            file: "main.tex",
            selection: { anchor: offset, head: offset },
            text: changed,
          },
        ],
      });
    });
    const marked = host.querySelector(".collab-block");
    expect(marked?.getAttribute("data-collab-name")).toBe("Anna de Vries");
    expect(marked?.textContent).toContain("Second paragraph");

    await act(async () => {
      usePresenceStore.setState({ peers: [] });
    });
    expect(host.querySelector(".collab-block")).toBeNull();
    root.unmount();
  });
});
