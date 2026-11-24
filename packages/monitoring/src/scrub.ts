// What every Scholarkit part removes from errors and logs before they leave, on the server, in
// the browser and in the desktop apps: IP addresses, cookies, headers, bodies, email addresses
// and review link tokens. It imports no Sentry SDK, so the browser and Next.js setups use it too.

/** Request headers kept on events; all others (cookies, authorization, forwarded addresses) go. */
export const KEPT_HEADERS = ["accept", "content-length", "content-type", "user-agent"];

/** Keys dropped from log attributes and event data wherever they appear. */
const DROPPED_KEYS = new Set([
  "authorization",
  "cookie",
  "cookies",
  "email",
  "ip",
  "ip_address",
  "remoteAddress",
  "remotePort",
  "set-cookie",
  "to",
  "x-forwarded-for",
]);

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

/**
 * A URL or path without its query string, with review link tokens and file names replaced:
 * /api/review/abc?x=1 becomes /api/review/[token], /api/projects/4/assets/Fig%201.png becomes
 * /api/projects/4/assets/[file]. A file name can say whose work it is.
 */
export function scrubUrl(url: string): string {
  const [, origin = "", path = ""] = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)?([^?#]*)/i.exec(
    url,
  )!;
  return (
    origin +
    path
      .replace(/\/(review|r)\/[^/]+/g, "/$1/[token]")
      .replace(
        /\/(?:[^/]*%[0-9a-f]{2}[^/]*|[^/.]+\.[a-z0-9]{1,8})(?=\/|$)/gi,
        "/[file]",
      )
  );
}

/**
 * Absolute paths on someone's computer, with or without file://: /Users/ada/Thesis/main.tex,
 * /home/ada/…, C:\\Users\\ada\\…. The folder and file names can say who it is and what they write.
 */
const PATH = new RegExp(
  // The start of an absolute path in a home, temporary or mounted folder, or on a drive.
  String.raw`(?:file://)?(?:/(?:Users|home|Volumes|media|mnt|private|var/folders|tmp)/|[a-z]:\\)` +
    // Its characters, and words after a space that go on with a slash: My Thesis/main.tex.
    String.raw`[^\s"'\`<>()[\]{},;:]*(?: [^\s"'\`<>()[\]{},;/\\]+[/\\][^\s"'\`<>()[\]{},;:]*)*(?<!\.)`,
  "gi",
);

/** A string with email addresses and paths on the user's computer replaced. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, "[email]").replace(PATH, "[path]");
}

/** A copy of a value with dropped keys removed, URLs scrubbed and email addresses replaced. */
export function scrubValue(value: unknown, key = "", depth = 0): unknown {
  if (typeof value === "string") {
    return /(^|\.)url$/i.test(key) || key === "path" || key === "from"
      ? scrubText(scrubUrl(value))
      : scrubText(value);
  }
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => scrubValue(item, key, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const last = k.split(".").pop()!;
    if (DROPPED_KEYS.has(last)) continue;
    out[k] = scrubValue(v, k, depth + 1);
  }
  return out;
}

/** The parts of a Sentry event that can carry a person; the SDKs' event types all fit it. */
interface Scrubbable {
  user?: unknown;
  request?: { url?: string; method?: string; headers?: Record<string, string> };
  transaction?: string;
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
}

/** The event with everything that identifies a person removed; changes it in place. */
export function scrubEvent<E extends object>(event: E): E {
  const e = event as Scrubbable;
  delete e.user;
  if (e.request) {
    const { url, method, headers } = e.request;
    e.request = {
      method,
      url: url === undefined ? undefined : scrubUrl(url),
      headers: Object.fromEntries(
        Object.entries(headers ?? {}).filter(([name]) =>
          KEPT_HEADERS.includes(name.toLowerCase()),
        ),
      ),
    };
  }
  if (e.transaction) e.transaction = scrubUrl(e.transaction);
  if (e.message) e.message = scrubText(e.message);
  for (const exception of e.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
  }
  for (const breadcrumb of e.breadcrumbs ?? []) {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message);
    if (breadcrumb.data)
      breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  }
  if (e.extra) e.extra = scrubValue(e.extra) as Record<string, unknown>;
  if (e.contexts) e.contexts = scrubValue(e.contexts) as Record<string, unknown>;
  return event;
}

/** A copy of a log line with everything that identifies a person removed. */
export function scrubLog<L extends { message?: unknown; attributes?: unknown }>(
  log: L,
): L {
  return {
    ...log,
    message: typeof log.message === "string" ? scrubText(log.message) : log.message,
    attributes: log.attributes && scrubValue(log.attributes),
  } as L;
}
