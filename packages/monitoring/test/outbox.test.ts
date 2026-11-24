// The compile service's setup: events wait in the outbox instead of going out.
import * as Sentry from "@sentry/node";
import { afterAll, expect, it } from "vitest";
import { startMonitoring, stopMonitoring, takeOutbox } from "../src/index.js";

afterAll(stopMonitoring);

it("keeps the compile service's events in the outbox, scrubbed", async () => {
  // Nothing listens on port 9: an event sent out would be lost, not kept.
  const dsn = "http://key@127.0.0.1:9/3";
  expect(startMonitoring("compile", { SENTRY_DSN: dsn })).toBe(true);
  Sentry.captureException(new Error(["job for ada", "example.com failed"].join("@")));
  await Sentry.flush(2000);

  // Only the error event counts: with a release (on CI the SDK takes GITHUB_SHA) it also
  // queues a session.
  const envelopes = takeOutbox()
    .map((e) => e.toString())
    .filter((e) => e.split("\n")[1]?.includes('"type":"event"'));
  expect(envelopes).toHaveLength(1);
  const [header, , event] = envelopes[0]!
    .split("\n")
    .map((l) => JSON.parse(l) as unknown);
  expect((header as { dsn: string }).dsn).toBe(dsn);
  expect(JSON.stringify(event)).toContain("job for [email] failed");
  expect((event as { tags: { service: string } }).tags.service).toBe("compile");
  expect(takeOutbox()).toEqual([]);
});
