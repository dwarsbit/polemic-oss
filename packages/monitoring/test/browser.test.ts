// @vitest-environment happy-dom
// The page setup, against a stand-in for fetch: what a report holds and where it goes.
import * as Sentry from "@sentry/browser";
import { afterAll, expect, it, vi } from "vitest";
import { allowReports, reportError, startBrowserMonitoring } from "../src/browser.js";

const sent: { url: string; body: string }[] = [];
const fetch = vi.fn(async (url: string, init: RequestInit) => {
  sent.push({ url, body: String(init.body) });
  return new Response("{}");
});
vi.stubGlobal("fetch", fetch);
afterAll(() => vi.unstubAllGlobals());

const tunnel = "https://app.scholarkit.test/api/monitoring";

it("is off without a DSN", () => {
  expect(startBrowserMonitoring({ app: "polemic" })).toBe(false);
});

it("sends reports through the tunnel, without console output or a person", async () => {
  expect(
    startBrowserMonitoring({
      dsn: "https://key@o1.ingest.de.sentry.io/5",
      tunnel,
      app: "polemic",
      platform: "desktop",
      release: "polemic@0.25.0",
      maxEvents: 2,
    }),
  ).toBe(true);
  console.log("The secret chapter of my thesis");
  // The test's types are Node's; happy-dom gives the page a history.
  const { history } = globalThis as unknown as {
    history: { pushState(state: unknown, title: string, url: string): void };
  };
  history.pushState({}, "", "/r/review-token?x=1");
  reportError(new Error(["save failed for ada", "example.com"].join("@")), {
    action: "save",
  });
  await Sentry.flush(2000);

  expect(sent).toHaveLength(1);
  expect(sent[0]!.url).toBe(tunnel);
  const body = sent[0]!.body;
  expect(body).toContain("save failed for [email]");
  expect(body).toContain('"app":"polemic"');
  expect(body).toContain('"platform":"desktop"');
  expect(body).toContain('"action":"save"');
  expect(body).toContain("polemic@0.25.0");
  expect(body).not.toContain("secret chapter");
  expect(body).not.toContain("review-token");
});

it("sends nothing while reports aren't allowed", async () => {
  const before = sent.length;
  allowReports(false);
  reportError(new Error("held back"));
  await Sentry.flush(2000);
  expect(sent.length).toBe(before);
  allowReports(true);
});

it("stops after the most events a page may send", async () => {
  for (let i = 0; i < 5; i++) reportError(new Error(`failure ${i}`));
  await Sentry.flush(2000);
  // One from the test above, one more here: maxEvents is 2.
  expect(sent.filter((s) => s.body.includes('"type":"event"'))).toHaveLength(2);
});
