import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import type { Editor, JSONContent } from "@tiptap/core";
import { Text } from "@codemirror/state";
import { NodeSelection, type Transaction } from "@tiptap/pm/state";
import {
  AlertTriangle,
  Bold,
  ChevronDown,
  Italic,
  List,
  ListOrdered,
  Pi,
  Plus,
  Redo2,
  Sigma,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import {
  FROM_ELSEWHERE,
  RemoteBlocks,
  differingPart,
  mergeDoc,
  setRemoteBlocks,
} from "@scholarkit/collab/prosemirror";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { NewTheoremDialog } from "@/components/NewTheoremDialog";
import { SuggestToggle } from "@/components/SuggestToggle";
import { VisualChangeCard } from "@/components/VisualChangeCard";
import { useMainFileAuthors, useSuggestAuthor } from "@/hooks/useTrackChanges";
import { parseAuthors, parseChanges } from "@/lib/changes";
import { authorStyles } from "@/lib/changes-view";
import {
  setVisualSuggestAuthor,
  trackChangesExtensions,
} from "@/lib/visual/track-changes";
import {
  FIGURE_SCAFFOLD,
  TABLE_SCAFFOLD,
  insertAtCursor,
  setInsertHandler,
} from "@/lib/editor-insert";
import {
  HEADING_KINDS,
  INSERT_QUOTE_ENVS,
  addNewtheorem,
  ensurePackage,
  insertEnvBlock,
  insertMaketitle,
  insertTheoremEnvEntries,
  setHeadingKind,
  visualTexExtensions,
} from "@/lib/visual/extensions";
import {
  posForAnchor,
  anchorForLine,
  setFaceAnchor,
  takeFaceAnchor,
  type FaceAnchor,
} from "@/lib/visual/face-anchor";
import { fragmentToContent, looksLikeLatex } from "@/lib/visual/insert";
import {
  flushPendingSerialize,
  setPendingSerializeFlush,
} from "@/lib/visual/pending-serialize";
import { stepCrossFileMoveFromEditor } from "@/lib/outline-move";
import { setVisualRemoteHandler } from "@/lib/editor-edits";
import { carryOffset } from "@/lib/project-doc";
import { usePresenceStore } from "@/store/presence";
import { parseTex } from "@/lib/visual/parse";
import { serializeTex } from "@/lib/visual/serialize";
import type { DocNode } from "@/lib/visual/doc-types";
import { useEditorStore } from "@/store/editor";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { WritingPopover, type WritingIssue } from "@/components/WritingPopover";
import {
  WritingChecks,
  runVisualChecks,
  setVisualIssueHandler,
} from "@/lib/visual/writing";
import { useGrammarStatus } from "@/lib/grammar-check";
import { formatShortcut } from "@/lib/platform";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

/** The cursor's place in the document, for face switches. */
function anchorFromDoc(editor: NonNullable<ReturnType<typeof useEditor>>): FaceAnchor {
  const pos = editor.state.selection.from;
  let headingIndex = -1;
  editor.state.doc.descendants((node, nodePos) => {
    if (node.type.name === "heading" && nodePos < pos) headingIndex++;
    return true;
  });
  const parent = editor.state.doc.resolve(pos).parent;
  const text =
    parent.type.name === "paragraph" || parent.type.name === "heading"
      ? parent.textContent.slice(0, 60)
      : "";
  return { headingIndex: Math.max(headingIndex, 0), text };
}

/** The visual document for a source; never empty (ProseMirror needs a block). */
function docFromTex(src: string): JSONContent {
  const doc = parseTex(src) as unknown as JSONContent;
  if ((doc.content ?? []).length === 0) {
    return { ...doc, content: [{ type: "paragraph" }] };
  }
  return doc;
}

/** Select a just-inserted atom so its raw editor opens right away. */
function selectInserted(editor: Editor, type: string) {
  editor
    .chain()
    .command(({ tr }) => {
      const pos = tr.selection.from - 1;
      const node = tr.doc.nodeAt(pos);
      if (node !== null && node.type.name === type) {
        tr.setSelection(NodeSelection.create(tr.doc, pos));
        return true;
      }
      return false;
    })
    .run();
}

/** A menu entry for an environment: inside that env it lifts (the old
 *  quote button's toggle), otherwise it inserts context-dependently. */
function insertEnvMenuEntry(editor: Editor, env: string) {
  if (editor.isActive("envBlock", { env })) {
    editor.chain().focus().lift("envBlock").run();
    return;
  }
  insertEnvBlock(editor, env);
}

function VisualToolbar({ editor }: { editor: Editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      headingCmd: (editor.getAttributes("heading").cmd as string | undefined) ?? null,
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      code: editor.isActive("code"),
      underline: editor.isActive("underline"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  // The theorem section covers \newtheorem-declared envs live.
  const theoremEnvs = useEditorState({
    editor,
    selector: ({ editor }) => insertTheoremEnvEntries(editor),
  });

  // The New theorem environment dialog.
  const [theoremOpen, setTheoremOpen] = useState(false);

  const toggle = (fn: () => void) => () => {
    fn();
    editor.commands.focus();
  };

  const headingLabel =
    HEADING_KINDS.find((k) => k.cmd === active?.headingCmd)?.label ?? t("Body text");

  const insertFootnote = () => {
    editor
      .chain()
      .focus()
      .insertContent({ type: "footnote", attrs: { src: "\\footnote{}" } })
      .run();
    selectInserted(editor, "footnote");
  };

  const insertDisplayMath = () => {
    editor
      .chain()
      .focus()
      .insertContent({ type: "mathBlock", attrs: { src: "\\[\\]" } })
      .run();
    selectInserted(editor, "mathBlock");
  };

  function commitNewtheorem(
    env: string,
    display: string,
    insertInstance: boolean,
  ): string | null {
    if (!addNewtheorem(editor, env, display)) {
      return t("This file has no preamble to hold the declaration.");
    }
    if (insertInstance) insertEnvBlock(editor, env);
    editor.commands.focus();
    return null;
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b px-2 [scrollbar-width:none] *:shrink-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Plus className="size-3.5" />
            {t("Insert")}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[28rem] overflow-y-auto">
          <DropdownMenuLabel>{t("Environments")}</DropdownMenuLabel>
          {INSERT_QUOTE_ENVS.map((entry) => (
            <DropdownMenuItem
              key={entry.env}
              onSelect={toggle(() => insertEnvMenuEntry(editor, entry.env))}
            >
              {entry.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("Theorem environments")}</DropdownMenuLabel>
          {(theoremEnvs ?? []).map((entry) => (
            <DropdownMenuItem
              key={entry.env}
              onSelect={toggle(() => {
                ensurePackage(editor, "amsthm");
                insertEnvMenuEntry(editor, entry.env);
              })}
            >
              {entry.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("Inline & floats")}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={toggle(insertFootnote)}>
            {t("Footnote (\\footnote)")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle(insertDisplayMath)}>
            {t("Display math (\\[…\\])")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle(() => insertAtCursor(FIGURE_SCAFFOLD))}>
            {t("Figure")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle(() => insertAtCursor(TABLE_SCAFFOLD))}>
            {t("Table")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTheoremOpen(true)}>
            {t("New theorem environment…")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewTheoremDialog
        open={theoremOpen}
        onOpenChange={setTheoremOpen}
        existingEnvs={(theoremEnvs ?? []).map((entry) => entry.env)}
        onCommit={commitNewtheorem}
      />
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            {headingLabel}
            <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={active?.headingCmd ?? ""}>
            {HEADING_KINDS.map((kind) => (
              <DropdownMenuRadioItem
                key={kind.cmd}
                value={kind.cmd}
                onSelect={() => setHeadingKind(editor, kind)}
              >
                {kind.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setHeadingKind(editor, null)}>
            {t("Body text")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <ButtonGroup>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("Undo ({formatShortcut})", {
            formatShortcut: formatShortcut("Mod+Z"),
          })}
          disabled={!active?.canUndo}
          onClick={toggle(() => editor.chain().undo().run())}
        >
          <Undo2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("Redo ({formatShortcut})", {
            formatShortcut: formatShortcut("Mod+Shift+Z"),
          })}
          disabled={!active?.canRedo}
          onClick={toggle(() => editor.chain().redo().run())}
        >
          <Redo2 className="size-4" />
        </Button>
      </ButtonGroup>
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <ButtonGroup>
        <Button
          variant={active?.bold ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Bold ({formatShortcut})", {
            formatShortcut: formatShortcut("Mod+B"),
          })}
          onClick={toggle(() => editor.chain().toggleBold().run())}
        >
          <Bold className="size-4" />
        </Button>
        <Button
          variant={active?.italic ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Emphasis ({formatShortcut})", {
            formatShortcut: formatShortcut("Mod+I"),
          })}
          onClick={toggle(() => editor.chain().toggleItalic().run())}
        >
          <Italic className="size-4" />
        </Button>
        <Button
          variant={active?.underline ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Underline ({formatShortcut})", {
            formatShortcut: formatShortcut("Mod+U"),
          })}
          onClick={toggle(() => editor.chain().toggleUnderline().run())}
        >
          <Underline className="size-4" />
        </Button>
        <Button
          variant={active?.code ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Monospace (\\\\texttt)")}
          onClick={toggle(() => editor.chain().toggleCode().run())}
        >
          <Type className="size-4" />
        </Button>
      </ButtonGroup>
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <ButtonGroup>
        <Button
          variant={active?.bullet ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Bulleted list (itemize)")}
          onClick={toggle(() => editor.chain().toggleBulletList().run())}
        >
          <List className="size-4" />
        </Button>
        <Button
          variant={active?.ordered ? "secondary" : "ghost"}
          size="icon-sm"
          title={t("Numbered list (enumerate)")}
          onClick={toggle(() => editor.chain().toggleOrderedList().run())}
        >
          <ListOrdered className="size-4" />
        </Button>
      </ButtonGroup>
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <ButtonGroup>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("Inline math ($…$, or type it directly)")}
          onClick={() => {
            editor
              .chain()
              .focus()
              .insertContent({ type: "mathInline", attrs: { src: "$x$" } })
              .run();
            selectInserted(editor, "mathInline");
          }}
        >
          <Sigma className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("Display math")}
          onClick={() => {
            editor
              .chain()
              .focus()
              .insertContent({ type: "mathBlock", attrs: { src: "\\[\\]" } })
              .run();
            selectInserted(editor, "mathBlock");
          }}
        >
          <Pi className="size-4" />
        </Button>
      </ButtonGroup>
      <Separator orientation="vertical" className="h-5 data-vertical:self-center" />
      <SuggestToggle />
    </div>
  );
}

/**
 * The Visual face of a .tex file: the document rendered as rich text,
 * with the TeX regenerated from it on every edit (Overleaf's rich-text
 * model). Content flows through the shared editor store, so dirty
 * state, saving, and the Code face stay exactly as they are.
 */
export function VisualTexEditor() {
  const docVersion = useEditorStore((s) => s.docVersion);
  // Content at entry: if visual edits changed it, the Code face
  // resyncs on the way back (its docVersion effect replaces the doc).
  const [entryContent] = useState(() => useEditorStore.getState().content);
  const anchorRef = useRef<FaceAnchor>({ headingIndex: 0, text: "" });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        document: false,
        heading: false,
        listItem: false,
        hardBreak: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        strike: false,
      }),
      ...visualTexExtensions,
      ...trackChangesExtensions,
      WritingChecks,
      RemoteBlocks,
    ],
    content: docFromTex(entryContent),
    editable: !useProjectStore.getState().project?.readOnly,
    editorProps: {
      // A cross-file outline move steps in both files: Tiptap's history
      // holds only this file's half of it. The store copy is compared,
      // not a reserialization, which is not byte-identical to the source.
      handleKeyDown: (_view, event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return false;
        const key = event.key.toLowerCase();
        const direction =
          key === "z"
            ? event.shiftKey
              ? "redo"
              : "undo"
            : key === "y"
              ? "redo"
              : null;
        if (direction === null) return false;
        flushPendingSerialize();
        const content = useEditorStore.getState().content;
        return stepCrossFileMoveFromEditor(
          useProjectStore.getState().activeFile,
          Text.of(content.split("\n")),
          direction,
        );
      },
      // Pasted LaTeX becomes nodes, not literal text.
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        if (text.length === 0 || !looksLikeLatex(text)) return false;
        const content = fragmentToContent(text);
        if (content.length === 0) return false;
        editor?.commands.insertContent(content);
        return true;
      },
    },
    onSelectionUpdate: ({ editor }) => {
      anchorRef.current = anchorFromDoc(editor);
    },
    onUpdate: ({ editor }) => {
      anchorRef.current = anchorFromDoc(editor);
    },
  });

  // Serializing the document to TeX is whole-document work; the store
  // copy lags at most the delay behind the editor. The anchor stays
  // immediate (onUpdate above), and this effect's cleanup flushes on
  // unmount — before the leaving-face resync reads the store. Saves
  // and buffer flushes call the flush through the registry first.
  useEffect(() => {
    if (editor === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Only an edit since the last flush serializes: the TeX the face
    // regenerates is not byte-identical to the source (blank lines
    // between blocks), so flushing an untouched document would mark the
    // file dirty, and rewrite it, just for being viewed.
    const flush = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      const tex = serializeTex(editor.getJSON() as unknown as DocNode);
      useEditorStore.getState().setContent(tex);
      useProjectStore.getState().noteActiveEdit(tex);
    };
    const previous = setPendingSerializeFlush(flush);
    const schedule = ({ transaction }: { transaction: Transaction }) => {
      // A change from elsewhere is already in the store as its own TeX.
      if (transaction.getMeta(FROM_ELSEWHERE)) return;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };
    editor.on("update", schedule);
    return () => {
      editor.off("update", schedule);
      flush();
      setPendingSerializeFlush(previous);
    };
  }, [editor]);

  // Others' changes to this file come in where they changed it, so your
  // place stays; a change that doesn't fit reloads (the effect below).
  useEffect(() => {
    if (editor === null) return;
    setVisualRemoteHandler((content) => {
      if (editor.isDestroyed) return false;
      const store = useEditorStore.getState();
      try {
        const base = editor.schema.nodeFromJSON(docFromTex(store.content));
        const next = editor.schema.nodeFromJSON(docFromTex(content));
        // A change outside what the face shows (a comment, spacing) has nothing to bring in.
        if (differingPart(base, next) !== null && !mergeDoc(editor, next, base))
          return false;
      } catch {
        return false;
      }
      store.setContent(content);
      useProjectStore.getState().noteActiveEdit(content);
      return true;
    });
    return () => setVisualRemoteHandler(null);
  }, [editor]);

  // Where the others in this file are: a bar by the block each one is
  // in (online). Their place in the TeX maps onto the blocks by line,
  // the way the faces keep your place when you switch.
  useEffect(() => {
    if (editor === null) return;
    let shown = false;
    const show = () => {
      if (editor.isDestroyed) return;
      const file = useProjectStore.getState().activeFile;
      const content = useEditorStore.getState().content;
      const blocks = usePresenceStore.getState().peers.flatMap((peer) => {
        if (peer.file !== file || !peer.selection || peer.text === null) return [];
        const offset = carryOffset(peer.text, content, peer.selection.head);
        const line = content.slice(0, offset).split("\n").length;
        const pos = posForAnchor(editor.state.doc, anchorForLine(content, line));
        return pos === null
          ? []
          : [{ id: String(peer.clientId), name: peer.name, color: peer.color, pos }];
      });
      if (blocks.length === 0 && !shown) return;
      shown = blocks.length > 0;
      setRemoteBlocks(editor, blocks);
    };
    show();
    return usePresenceStore.subscribe(show);
  }, [editor]);

  // External reloads (file open, tab switch) reparse into the editor.
  // setContent emits an update by default in v3 — that would mark the
  // file dirty just for looking at it, so the resync stays silent.
  // A reload of the same file keeps the cursor's place (the anchor
  // re-resolves in the reparsed document); a different file starts
  // at the top.
  const lastFileRef = useRef<string | null>(null);
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    const store = useEditorStore.getState();
    const activeFile = useProjectStore.getState().activeFile;
    const sameFile = activeFile !== null && activeFile === lastFileRef.current;
    const anchor = sameFile ? anchorRef.current : null;
    editor.commands.setContent(docFromTex(store.content), { emitUpdate: false });
    lastFileRef.current = activeFile;
    if (anchor !== null) {
      const pos = posForAnchor(editor.state.doc, anchor);
      if (pos !== null) editor.commands.setTextSelection(pos);
    }
  }, [docVersion, editor]);

  // Panel jumps (labels, search, issues, outline) land in this face
  // when it is the active one; the source line maps onto the document
  // through the face anchor, approximately.
  const jumpTarget = useEditorStore((s) => s.jumpTarget);
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    const line = useEditorStore.getState().jumpTarget;
    if (line === null) return;
    const { content, clearJump } = useEditorStore.getState();
    const anchor = anchorForLine(content, line);
    const pos = posForAnchor(editor.state.doc, anchor);
    if (pos !== null) {
      editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
    }
    clearJump();
  }, [jumpTarget, editor]);

  // Serve panel/dialog inserts: LaTeX fragments parse into nodes
  // (figures, pills, lists), math symbols become inline math.
  useEffect(() => {
    if (editor === null) return;
    const previous = setInsertHandler((text, _cursorOffset, opts) => {
      if (opts?.asMath === true) {
        editor
          .chain()
          .focus()
          .insertContent({ type: "mathInline", attrs: { src: `$${text}$` } })
          .run();
        return;
      }
      if (!looksLikeLatex(text)) {
        editor.chain().focus().insertContent(text).run();
        return;
      }
      editor.chain().focus().insertContent(fragmentToContent(text)).run();
    });
    return () => {
      setInsertHandler(previous);
    };
  }, [editor]);

  // Entering the visual face: land where the code cursor was.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) return;
    const anchor = takeFaceAnchor();
    if (anchor === null) return;
    const pos = posForAnchor(editor.state.doc, anchor);
    if (pos !== null) editor.commands.setTextSelection(pos);
  }, [editor]);

  // Leaving the visual face: hand the regenerated TeX to CodeMirror,
  // with the cursor's place for the resync to restore.
  useEffect(() => {
    return () => {
      const store = useEditorStore.getState();
      if (store.content !== entryContent) {
        setFaceAnchor(anchorRef.current);
        store.loadContent(store.content);
      }
    };
  }, [entryContent]);

  const rawCount = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (editor === null) return 0;
      let count = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "rawTexBlock" || node.type.name === "rawTexInline")
          count++;
        return true;
      });
      return count;
    },
  });

  // Title metadata without a \maketitle to render it: offer to add one.
  const missingMaketitle = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (editor === null) return false;
      let hasMeta = false;
      let hasTitleBlock = false;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "titleBlock") hasTitleBlock = true;
        if (
          node.type.name === "preamble" &&
          (node.attrs.titleSrc !== null ||
            node.attrs.authorSrc !== null ||
            node.attrs.dateSrc !== null)
        ) {
          hasMeta = true;
        }
        return true;
      });
      return hasMeta && !hasTitleBlock;
    },
  });

  const fontSize = useSettingsStore((s) => s.fontSize);
  const spellcheckEnabled = useSettingsStore((s) => s.spellcheckEnabled);
  const spellcheckLanguage = useSettingsStore((s) => s.spellcheckLanguage);
  const grammar = useSettingsStore((s) => s.grammar);
  const grammarRetry = useGrammarStatus((s) => s.retry);

  // Spelling and grammar, as in the Code face: debounced after edits,
  // and again when the settings change.
  const [writingPopover, setWritingPopover] = useState<{
    issue: WritingIssue;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (editor === null) return;
    setVisualIssueHandler((issue, x, y) => setWritingPopover({ issue, x, y }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => void runVisualChecks(editor.view), delay);
    };
    const onUpdate = () => schedule(1000);
    editor.on("update", onUpdate);
    schedule(300);
    return () => {
      clearTimeout(timer);
      editor.off("update", onUpdate);
      setVisualIssueHandler(null);
    };
  }, [editor, spellcheckEnabled, spellcheckLanguage, grammar, grammarRetry]);

  // Suggest mode follows the switch, the author and the open file.
  const suggestAuthor = useSuggestAuthor();
  useEffect(() => {
    setVisualSuggestAuthor(suggestAuthor);
    return () => setVisualSuggestAuthor(null);
  }, [suggestAuthor]);

  // Suggestion colors per author: the open file's and the main file's
  // declarations, set as --change-color on the marks.
  const content = useEditorStore((s) => s.content);
  const mainAuthors = useMainFileAuthors();
  const changeStyles = useMemo(
    () =>
      authorStyles(
        [...parseAuthors(content), ...mainAuthors],
        parseChanges(content).map((c) => c.author),
      ),
    [content, mainAuthors],
  );
  const changeCss = useMemo(
    () =>
      [...changeStyles]
        .map(([id, style]) =>
          id === null
            ? `.visual-editor .vis-change:not([data-author]) { --change-color: ${style.color}; }`
            : `.visual-editor .vis-change[data-author="${CSS.escape(id)}"] { --change-color: ${style.color}; }`,
        )
        .join("\n"),
    [changeStyles],
  );
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  if (editor === null) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <VisualToolbar editor={editor} />
      {(rawCount ?? 0) > 0 && (
        <p className="shrink-0 border-b bg-accent/40 px-3 py-1 text-xs text-muted-foreground">
          {t(
            "Some constructs are shown as raw LaTeX. Double-click to edit them in place, or switch to Code.",
          )}
        </p>
      )}
      {missingMaketitle === true && (
        <p className="flex shrink-0 items-center gap-2 border-b bg-accent/40 px-3 py-1 text-xs text-muted-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-warning" />
          {rich(
            "No \\maketitle: the title will not appear in the PDF.<0>Insert \\maketitle</0>",
            [
              (c) => (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => insertMaketitle(editor)}
                >
                  {c}
                </Button>
              ),
            ],
          )}
        </p>
      )}
      <style>{changeCss}</style>
      <VisualChangeCard editor={editor} container={scrollEl} styles={changeStyles} />
      <div
        ref={setScrollEl}
        className="min-h-0 flex-1 overflow-y-auto"
        onMouseDown={() => setWritingPopover(null)}
      >
        {/* The settings' font size drives the reading column (like the
            Code face). Spelling and grammar come from the app's own
            checks (WritingChecks), not the browser's. */}
        <div
          className="visual-editor mx-auto max-w-3xl px-8 py-6"
          style={{ "--editor-font-size": `${fontSize}px` } as React.CSSProperties}
          spellCheck={false}
          lang={spellcheckLanguage.length > 0 ? spellcheckLanguage : undefined}
        >
          <EditorContent editor={editor} />
        </div>
        {writingPopover !== null && (
          <WritingPopover
            key={`${writingPopover.issue.from}:${writingPopover.x}:${writingPopover.y}`}
            issue={writingPopover.issue}
            x={writingPopover.x}
            y={writingPopover.y}
            onReplace={(text) => {
              const { issue } = writingPopover;
              const expected =
                issue.kind === "spelling" ? issue.word : issue.issue.text;
              setWritingPopover(null);
              const { state } = editor.view;
              // Only while the text is still what was flagged.
              if (state.doc.textBetween(issue.from, issue.to) !== expected) return;
              const tr =
                text === ""
                  ? state.tr.delete(issue.from, issue.to)
                  : state.tr.insertText(text, issue.from, issue.to);
              editor.view.dispatch(tr);
              editor.commands.focus();
            }}
            onDone={(recheck) => {
              setWritingPopover(null);
              if (recheck) void runVisualChecks(editor.view);
            }}
          />
        )}
      </div>
    </div>
  );
}
