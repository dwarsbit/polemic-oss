// Passes Sentry envelopes on to Sentry for clients that don't send there themselves: the
// browser and desktop apps (Sentry's tunnel option points at the API) and the compile service,
// which has no way out. Sentry then sees the API's address, never the user's, and ad blockers,
// which block sentry.io, let the reports through. Only envelopes for the configured DSNs pass.

import { gunzipSync } from "node:zlib";

export interface Dsn {
  protocol: string;
  publicKey: string;
  host: string;
  /** Anything between the host and the project id; usually empty. */
  path: string;
  projectId: string;
}

/** A DSN's parts, or null when it isn't one. */
export function parseDsn(dsn: string): Dsn | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const slash = url.pathname.lastIndexOf("/");
  const projectId = url.pathname.slice(slash + 1);
  if (!url.username || !/^\d+$/.test(projectId)) return null;
  return {
    protocol: url.protocol.slice(0, -1),
    publicKey: url.username,
    host: url.host,
    path: url.pathname.slice(0, slash),
    projectId,
  };
}

/** Where Sentry takes envelopes for a DSN's project. */
export function envelopeUrl(dsn: Dsn): string {
  return `${dsn.protocol}://${dsn.host}${dsn.path}/api/${dsn.projectId}/envelope/`;
}

const same = (a: Dsn, b: Dsn) =>
  a.protocol === b.protocol &&
  a.host === b.host &&
  a.path === b.path &&
  a.projectId === b.projectId &&
  a.publicKey === b.publicKey;

/** Longest envelope header read: it holds the DSN, the SDK and a few ids. */
const MAX_HEADER_BYTES = 16_384;
/** Largest gzipped envelope unpacked to read its header. */
const MAX_UNPACKED_BYTES = 20_000_000;

/** The envelope's first line, parsed; null when it isn't an envelope. */
function readHeader(body: Uint8Array, encoding: string | undefined): unknown {
  let bytes = body;
  if (encoding === "gzip") {
    try {
      bytes = gunzipSync(body, { maxOutputLength: MAX_UNPACKED_BYTES });
    } catch {
      return null;
    }
  } else if (encoding !== undefined && encoding !== "identity") {
    return null;
  }
  const end = bytes.indexOf(10);
  const line = bytes.subarray(0, end < 0 ? bytes.length : end);
  if (line.length > MAX_HEADER_BYTES) return null;
  try {
    return JSON.parse(new TextDecoder().decode(line));
  } catch {
    return null;
  }
}

/** Sentry's answer, or ours: the status and the headers that tell an SDK to slow down. */
export interface Forwarded {
  status: number;
  headers: Record<string, string>;
}

/** Response headers an SDK reads to hold back: passed on from Sentry. */
export const RATE_LIMIT_HEADERS = ["x-sentry-rate-limits", "retry-after"];

export interface Forwarder {
  /** Whether any DSN is configured; without one every envelope is refused. */
  readonly on: boolean;
  /**
   * Sends an envelope, as it came (gzipped or not), to the project its header names when that
   * DSN is one of ours. 400: not an envelope; 403: another DSN; 502: Sentry didn't answer.
   */
  forward(body: Uint8Array, encoding?: string): Promise<Forwarded>;
}

export function createForwarder({
  dsns,
  fetch = globalThis.fetch,
  timeoutMs = 10_000,
}: {
  /** The DSNs whose envelopes pass; unset and empty ones are left out. */
  dsns: (string | undefined)[];
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): Forwarder {
  const allowed = dsns
    .filter((d): d is string => !!d)
    .map(parseDsn)
    .filter((d): d is Dsn => d !== null);
  return {
    on: allowed.length > 0,
    async forward(body, encoding) {
      const header = readHeader(body, encoding);
      if (!header || typeof header !== "object") return { status: 400, headers: {} };
      const named = (header as { dsn?: unknown }).dsn;
      const dsn = typeof named === "string" ? parseDsn(named) : null;
      const target = dsn && allowed.find((d) => same(d, dsn));
      if (!target) return { status: 403, headers: {} };
      let res: Response;
      try {
        res = await fetch(envelopeUrl(target), {
          method: "POST",
          body: body as Uint8Array<ArrayBuffer>,
          headers: {
            "content-type": "application/x-sentry-envelope",
            ...(encoding === "gzip" ? { "content-encoding": "gzip" } : {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        await res.arrayBuffer();
      } catch {
        return { status: 502, headers: {} };
      }
      const headers: Record<string, string> = {};
      for (const name of RATE_LIMIT_HEADERS) {
        const value = res.headers.get(name);
        if (value) headers[name] = value;
      }
      return { status: res.status, headers };
    },
  };
}
