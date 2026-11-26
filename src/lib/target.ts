/**
 * Which app this bundle is: the desktop app (Tauri) or the browser
 * build (`vite --mode web`, see src/web). Fixed at build time, so the
 * bundler drops the other target's branches.
 */
export const isWeb = import.meta.env.MODE === "web";

/**
 * Desktop features the browser build leaves out, for now or for good.
 * Components check these rather than `isWeb`, so each hidden feature
 * says why it is hidden.
 */
export const features = {
  /** Folders on this computer: open a folder, the projects folder,
   *  reveal in the file manager, file pickers, the system PDF viewer. */
  localFiles: !isWeb,
  /** Git and local snapshots, with their panels and settings. */
  versionControl: !isWeb,
  /** TeX on this computer and the choice of where to compile. */
  localTex: !isWeb,
  /** Signing the desktop app in; the browser uses the site's session. */
  desktopAccount: !isWeb,
  /** An own AI provider for the assistant: the key and the model's
   *  server stay on this computer. The browser asks our model. */
  ownAiProvider: !isWeb,
  /** The built-in grammar checker, and with it the choice of checker:
   *  the browser checks with the server's. */
  grammarChoice: !isWeb,
  /** Reference sources on this computer: .bib files and folders on
   *  disk, and the Zotero app. The browser takes .bib files from your
   *  projects and Zotero cloud instead. */
  localSources: !isWeb,
} as const;
