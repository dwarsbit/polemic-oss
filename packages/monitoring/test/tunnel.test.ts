import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createForwarder, envelopeUrl, parseDsn } from "../src/tunnel.js";

describe("parseDsn", () => {
  it("reads a DSN's parts", () => {
    const dsn = parseDsn("https://abc@o1.ingest.de.sentry.io/42")!;
    expect(dsn).toEqual({
      protocol: "https",
      publicKey: "abc",
      host: "o1.ingest.de.sentry.io",
      path: "",
      projectId: "42",
    });
    expect(envelopeUrl(dsn)).toBe("https://o1.ingest.de.sentry.io/api/42/envelope/");
  });

  it("refuses what isn't a DSN", () => {
    expect(parseDsn("not a url")).toBeNull();
    expect(parseDsn("https://o1.ingest.de.sentry.io/42")).toBeNull();
    expect(parseDsn("https://abc@o1.ingest.de.sentry.io/project")).toBeNull();
  });
});

describe("createForwarder", () => {
  const received: { url?: string; headers: IncomingHttpHeaders; body: Buffer }[] = [];
  let ingest: Server;
  let dsn: string;
  let answer = { status: 200, headers: {} as Record<string, string> };

  beforeAll(async () => {
    ingest = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        received.push({
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks),
        });
        res.writeHead(answer.status, answer.headers).end("{}");
      });
    });
    await new Promise<void>((resolve) => ingest.listen(0, "127.0.0.1", resolve));
    dsn = `http://key@127.0.0.1:${(ingest.address() as AddressInfo).port}/7`;
  });

  afterAll(() => ingest.close());

  const envelope = (header: object) =>
    Buffer.from(`${JSON.stringify(header)}\n{"type":"event"}\n{"message":"boom"}\n`);

  it("is off without a DSN", () => {
    expect(createForwarder({ dsns: [undefined, ""] }).on).toBe(false);
  });

  it("passes an envelope for one of its DSNs on, as it came", async () => {
    const forwarder = createForwarder({ dsns: [dsn] });
    const body = envelope({ dsn, event_id: "e1" });
    expect(await forwarder.forward(body)).toEqual({ status: 200, headers: {} });
    const last = received.at(-1)!;
    expect(last.url).toBe("/api/7/envelope/");
    expect(last.headers["content-type"]).toBe("application/x-sentry-envelope");
    expect(last.headers["x-forwarded-for"]).toBeUndefined();
    expect(last.body.equals(body)).toBe(true);
  });

  it("passes a gzipped envelope on without unpacking it", async () => {
    const forwarder = createForwarder({ dsns: [dsn] });
    const body = gzipSync(envelope({ dsn }));
    expect((await forwarder.forward(body, "gzip")).status).toBe(200);
    const last = received.at(-1)!;
    expect(last.headers["content-encoding"]).toBe("gzip");
    expect(last.body.equals(body)).toBe(true);
  });

  it("passes Sentry's rate limits back", async () => {
    answer = { status: 429, headers: { "retry-after": "60", "x-other": "1" } };
    const forwarder = createForwarder({ dsns: [dsn] });
    expect(await forwarder.forward(envelope({ dsn }))).toEqual({
      status: 429,
      headers: { "retry-after": "60" },
    });
    answer = { status: 200, headers: {} };
  });

  it("refuses envelopes for other DSNs and what isn't an envelope", async () => {
    const forwarder = createForwarder({ dsns: [dsn] });
    const before = received.length;
    const other = dsn.replace("key@", "other@");
    expect((await forwarder.forward(envelope({ dsn: other }))).status).toBe(403);
    expect((await forwarder.forward(envelope({}))).status).toBe(403);
    expect((await forwarder.forward(Buffer.from("hello"))).status).toBe(400);
    expect((await forwarder.forward(Buffer.from("not gzip"), "gzip")).status).toBe(400);
    expect((await forwarder.forward(envelope({ dsn }), "br")).status).toBe(400);
    expect(received.length).toBe(before);
  });

  it("answers 502 when Sentry can't be reached", async () => {
    const gone = "http://key@127.0.0.1:9/7";
    const forwarder = createForwarder({ dsns: [gone], timeoutMs: 2000 });
    expect((await forwarder.forward(envelope({ dsn: gone }))).status).toBe(502);
  });
});
