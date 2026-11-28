import type { Plugin } from "vite";

/** The `<meta>` that names the build a page runs. */
export const BUILD_META = "scholarkit-build";
/** The file next to `index.html` that names the build being served. */
export const VERSION_FILE = "version.json";

/** A short name for a build: the first 16 hex digits of the SHA-256 of `text`. */
export async function buildName(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Names each browser build, for "A new version is available" (`web/new-version.ts`).
 *
 * The name is a hash of the built `index.html`. That page lists every script and style file,
 * and Vite puts a hash of each file's content in its name, so the name changes exactly when
 * the app's code changes: a deploy that leaves the app alone shows it no notice. The name goes
 * into the page as `<meta name="scholarkit-build">` and into `version.json` next to it.
 */
export function buildVersion(): Plugin {
  return {
    name: "scholarkit-build-version",
    apply: "build",
    generateBundle: {
      // After Vite has written index.html with the final file names.
      order: "post",
      async handler(_options, bundle) {
        const page = bundle["index.html"];
        if (!page || page.type !== "asset") return;
        const html =
          typeof page.source === "string"
            ? page.source
            : new TextDecoder().decode(page.source);
        const build = await buildName(html);
        page.source = html.replace(
          /<\/head>/i,
          `  <meta name="${BUILD_META}" content="${build}" />\n  </head>`,
        );
        this.emitFile({
          type: "asset",
          fileName: VERSION_FILE,
          source: `${JSON.stringify({ build })}\n`,
        });
      },
    },
  };
}
