import { describe, expect, it } from "vitest";
import {
  loadMonitoringConfig,
  scrubEvent,
  scrubLog,
  scrubText,
  scrubUrl,
  startMonitoring,
} from "../src/index.js";

describe("configuration", () => {
  it("is off without SENTRY_DSN", () => {
    expect(startMonitoring("api", {})).toBe(false);
    expect(startMonitoring("api", { SENTRY_DSN: "" })).toBe(false);
  });

  it("sends warnings and up as logs by default", () => {
    expect(loadMonitoringConfig({}).SENTRY_LOGS).toBe("warn");
  });

  it("names a wrong setting", () => {
    expect(() => loadMonitoringConfig({ SENTRY_DSN: "not a url" })).toThrow(
      /SENTRY_DSN/,
    );
    expect(() => loadMonitoringConfig({ SENTRY_LOGS: "loud" })).toThrow(/SENTRY_LOGS/);
  });
});

describe("scrubbing", () => {
  it("drops query strings and review link tokens from URLs", () => {
    expect(scrubUrl("https://app.polemicapp.com/api/review/abc123/comments?x=1")).toBe(
      "https://app.polemicapp.com/api/review/[token]/comments",
    );
    expect(scrubUrl("/r/abc123")).toBe("/r/[token]");
    expect(scrubUrl("/api/projects/42")).toBe("/api/projects/42");
  });

  it("keeps no person on an event", () => {
    const event = scrubEvent({
      type: undefined,
      message: "mail to ada@example.com failed",
      user: { id: "u1", ip_address: "203.0.113.9" },
      request: {
        method: "GET",
        url: "https://app.polemicapp.com/api/review/abc?token=1",
        query_string: "token=1",
        cookies: { session: "s" },
        data: { password: "p" },
        headers: {
          Cookie: "session=s",
          Authorization: "Bearer t",
          "User-Agent": "Polemic",
          "X-Forwarded-For": "203.0.113.9",
        },
      },
      breadcrumbs: [
        {
          message: "GET /r/abc",
          data: { url: "http://localhost:4000/api/review/abc" },
        },
      ],
      contexts: {
        pino: {
          to: "ada@example.com",
          req: { remoteAddress: "203.0.113.9", url: "/api/review/abc" },
        },
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.message).toBe("mail to [email] failed");
    expect(event.request).toEqual({
      method: "GET",
      url: "https://app.polemicapp.com/api/review/[token]",
      headers: { "User-Agent": "Polemic" },
    });
    expect(event.breadcrumbs?.[0]?.data).toEqual({
      url: "http://localhost:4000/api/review/[token]",
    });
    expect(event.contexts).toEqual({ pino: { req: { url: "/api/review/[token]" } } });
  });

  it("keeps no person in a log", () => {
    const log = scrubLog({
      level: "error",
      message: "sending mail to ada@example.com failed",
      attributes: {
        to: "ada@example.com",
        "req.remoteAddress": "203.0.113.9",
        "req.url": "/api/review/abc?x=1",
        reqId: "r1",
      },
    });
    expect(log.message).toBe("sending mail to [email] failed");
    expect(log.attributes).toEqual({ "req.url": "/api/review/[token]", reqId: "r1" });
  });
});

describe("file names", () => {
  it("leaves out file names from URLs, and keeps the host", () => {
    expect(
      scrubUrl("https://app.scholarkit.app/api/projects/4/assets/figure.png"),
    ).toBe("https://app.scholarkit.app/api/projects/4/assets/[file]");
    expect(scrubUrl("/api/projects/4/files/Thesis%20draft/chapter")).toBe(
      "/api/projects/4/files/[file]/chapter",
    );
    expect(scrubUrl("https://scholarkit.app/polemic/")).toBe(
      "https://scholarkit.app/polemic/",
    );
  });
});

describe("paths", () => {
  it("leaves out paths on the user's computer", () => {
    expect(scrubText("Could not open /Users/ada/My Thesis/main.tex: denied")).toBe(
      "Could not open [path]: denied",
    );
    expect(scrubText("Saved C:\\Users\\ada\\Paper\\refs.bib.")).toBe("Saved [path].");
    expect(scrubText("file:///home/ada/notes.md failed")).toBe("[path] failed");
    expect(scrubText("GET /api/projects/4 failed")).toBe("GET /api/projects/4 failed");
  });
});
