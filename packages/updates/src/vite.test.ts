import { describe, expect, it, vi } from "vitest";
import { buildName, buildVersion } from "./vite";

type Handler = (
  this: { emitFile: (file: unknown) => void },
  options: unknown,
  bundle: Record<string, { type: string; source: string | Uint8Array }>,
) => Promise<void>;

async function run(html: string) {
  const plugin = buildVersion();
  const handler = (plugin.generateBundle as unknown as { handler: Handler }).handler;
  const bundle = { "index.html": { type: "asset", source: html } };
  const emitFile = vi.fn();
  await handler.call({ emitFile }, {}, bundle);
  return { html: String(bundle["index.html"].source), emitted: emitFile.mock.calls };
}

const PAGE = `<!doctype html>\n<html>\n  <head>\n    <script src="/cursive/assets/index-A1.js"></script>\n  </head>\n</html>\n`;

describe("buildVersion", () => {
  it("names the build in the page and in version.json", async () => {
    const { html, emitted } = await run(PAGE);
    const build = await buildName(PAGE);
    expect(build).toMatch(/^[0-9a-f]{16}$/);
    expect(html).toContain(`<meta name="scholarkit-build" content="${build}" />`);
    expect(emitted).toEqual([
      [{ type: "asset", fileName: "version.json", source: `{"build":"${build}"}\n` }],
    ]);
  });

  it("gives the same name to the same files and another to changed ones", async () => {
    expect(await buildName(PAGE)).toBe(await buildName(PAGE));
    expect(await buildName(PAGE.replace("A1", "B2"))).not.toBe(await buildName(PAGE));
  });
});
