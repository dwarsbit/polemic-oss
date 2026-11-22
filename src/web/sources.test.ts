import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { buildProjectDoc, type FolderEntry } from "@/lib/project-doc";
import { toBase64 } from "@/lib/share";
import {
  bibFilesOf,
  clearSourceDocs,
  parseBibSourcePath,
  sourceCommands,
} from "@/web/sources";

const text = (path: string, value: string): FolderEntry => ({
  path,
  kind: "text",
  text: value,
});

const library = () =>
  buildProjectDoc([
    text("main.tex", "\\cite{knuth}"),
    text("refs/books.bib", "@book{knuth, title={TAOCP}}"),
    text("papers.bib", "@article{lamport, title={LaTeX}}"),
    text(".trash/old.bib", "@misc{gone}"),
  ]);

let fetches: string[] = [];

beforeEach(() => {
  clearSourceDocs();
  fetches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetches.push(url);
      if (!url.startsWith("/api/projects/lib/")) {
        return Response.json(
          { error: "not_found", message: "Not found" },
          { status: 404 },
        );
      }
      return Response.json({
        update: toBase64(Y.encodeStateAsUpdate(library())),
        stateVector: "",
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseBibSourcePath", () => {
  it("reads a whole project or one .bib file in it", () => {
    expect(parseBibSourcePath("/projects/abc_1")).toEqual({ id: "abc_1", file: null });
    expect(parseBibSourcePath("/projects/abc/refs/books.bib")).toEqual({
      id: "abc",
      file: "refs/books.bib",
    });
  });

  it("refuses other paths", () => {
    expect(parseBibSourcePath("/Users/leon/refs.bib")).toBeNull();
    expect(parseBibSourcePath("/projects/abc/main.tex")).toBeNull();
    expect(parseBibSourcePath("/projects/abc/../x.bib")).toBeNull();
    expect(parseBibSourcePath("/projects/a b")).toBeNull();
  });
});

describe("bibFilesOf", () => {
  it("lists the .bib files, sorted, without dot folders", () => {
    expect(bibFilesOf(library())).toEqual(["papers.bib", "refs/books.bib"]);
  });
});

describe("source commands", () => {
  it("lists every .bib file of a project", async () => {
    await expect(
      sourceCommands.list_bib_files({ path: "/projects/lib" }),
    ).resolves.toEqual(["/projects/lib/papers.bib", "/projects/lib/refs/books.bib"]);
  });

  it("lists one file, and fails once it is gone", async () => {
    await expect(
      sourceCommands.list_bib_files({ path: "/projects/lib/papers.bib" }),
    ).resolves.toEqual(["/projects/lib/papers.bib"]);
    await expect(
      sourceCommands.list_bib_files({ path: "/projects/lib/missing.bib" }),
    ).rejects.toBe("missing.bib doesn't exist.");
  });

  it("reads a file, fetching the project once", async () => {
    await sourceCommands.list_bib_files({ path: "/projects/lib" });
    await expect(
      sourceCommands.read_external_file({ path: "/projects/lib/refs/books.bib" }),
    ).resolves.toBe("@book{knuth, title={TAOCP}}");
    expect(fetches).toEqual(["/api/projects/lib/document/sync"]);
  });

  it("fails for a project you can't open", async () => {
    await expect(
      sourceCommands.list_bib_files({ path: "/projects/other" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
