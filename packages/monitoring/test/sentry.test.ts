// Starts Sentry against a local stand-in for its ingest endpoint and checks what a Fastify app sends.
import * as Sentry from "@sentry/node";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startMonitoring, stopMonitoring } from "../src/index.js";

type Item = Record<string, unknown>;
const items: Item[] = [];
let ingest: Server;

beforeAll(async () => {
  ingest = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body = Buffer.concat(chunks);
      if (req.headers["content-encoding"] === "gzip") body = gunzipSync(body);
      for (const line of body.toString().split("\n").slice(1)) {
        if (line.startsWith("{")) items.push(JSON.parse(line) as Item);
      }
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => ingest.listen(0, "127.0.0.1", resolve));
  const { port } = ingest.address() as AddressInfo;
  expect(
    startMonitoring("api", {
      SENTRY_DSN: `http://key@127.0.0.1:${port}/1`,
      SENTRY_RELEASE: "test",
    }),
  ).toBe(true);
});

afterAll(async () => {
  await stopMonitoring();
  ingest.close();
});

// Built here, so the source lines Sentry attaches to stack frames don't contain them.
const token = ["secret", "token"].join("-");
const email = ["ada", "example.com"].join("@");
const cookie = ["session", "s"].join("=");
const bearer = ["Bearer", "t"].join(" ");

it("reports thrown and logged errors, and warnings as logs, without personal data", async () => {
  // Imported after Sentry starts, as main.ts does.
  const { default: Fastify } = await import("fastify");
  const app = Fastify({ logger: { level: "info" } });
  app.get("/api/review/:token", async () => {
    throw new Error("review failed");
  });
  app.get("/mail", async (req) => {
    req.log.error({ err: new Error("SMTP down"), to: email }, "sending mail failed");
    req.log.warn("slow mail");
    return {};
  });
  await app.inject({
    url: `/api/review/${token}?x=1`,
    headers: { cookie, authorization: bearer, "user-agent": "test" },
  });
  await app.inject({ url: "/mail" });
  await app.close();
  await Sentry.flush(2000);

  const events = items.filter((i) => "exception" in i);
  const messages = events.map(
    (e) => (e.exception as { values: { value: string }[] }).values[0]!.value,
  );
  expect(messages).toContain("review failed");
  expect(messages).toContain("SMTP down");
  const logs = items.flatMap((i) =>
    Array.isArray(i.items) ? (i.items as Item[]) : [],
  );
  expect(logs.map((l) => l.body)).toEqual(
    expect.arrayContaining(["slow mail", "sending mail failed"]),
  );
  expect(logs.map((l) => l.body)).not.toContain("incoming request");

  const sent = JSON.stringify(items);
  for (const secret of [token, email, cookie, bearer, "remoteAddress"])
    expect(sent).not.toContain(secret);
  const review = events.find((e) => JSON.stringify(e).includes("review failed"))!;
  expect((review.tags as Item).service).toBe("api");
  expect(review.release).toBe("test");
});
