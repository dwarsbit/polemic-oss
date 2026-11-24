// Error reporting and logs to Sentry for the servers: the API, the compile service and the
// account app's server (pages report on their own, see browser.ts). Off unless SENTRY_DSN is set:
// then nothing is loaded, sent or changed. When on, events and logs leave out what identifies a
// person (IP addresses, cookies, headers, bodies, email addresses, review link tokens, file names;
// see scrub.ts), because Sentry may store them outside the EU.

import * as Sentry from "@sentry/node";
import { z } from "zod";
import { outboxTransport } from "./outbox.js";
import { KEPT_HEADERS, scrubEvent, scrubLog } from "./scrub.js";

export { takeOutbox } from "./outbox.js";
export {
  KEPT_HEADERS,
  scrubEvent,
  scrubLog,
  scrubText,
  scrubUrl,
  scrubValue,
} from "./scrub.js";
export {
  createForwarder,
  envelopeUrl,
  parseDsn,
  RATE_LIMIT_HEADERS,
  type Dsn,
  type Forwarded,
  type Forwarder,
} from "./tunnel.js";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
type Level = (typeof LEVELS)[number];

const empty = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  /** The Sentry project's DSN. Unset or empty: Sentry is off. */
  SENTRY_DSN: z.preprocess(empty, z.url().optional()),
  /** Shown on every event and log, e.g. production or staging. Unset: NODE_ENV. */
  SENTRY_ENVIRONMENT: z.preprocess(empty, z.string().optional()),
  /** The release events belong to. The images set it to their commit. */
  SENTRY_RELEASE: z.preprocess(empty, z.string().optional()),
  /** The lowest log level sent to Sentry Logs, or "off". Error and fatal logs also become issues. */
  SENTRY_LOGS: z.preprocess(empty, z.enum([...LEVELS, "off"]).default("warn")),
  NODE_ENV: z.string().default("development"),
});

export type MonitoringConfig = z.infer<typeof schema>;

export function loadMonitoringConfig(
  env: NodeJS.ProcessEnv = process.env,
): MonitoringConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return parsed.data;
}

/** Console methods that write each log level, for the account app, which logs with console. */
const CONSOLE: Record<Level, "debug" | "info" | "warn" | "error"> = {
  trace: "debug",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "error",
};

/**
 * Starts Sentry for one service when SENTRY_DSN is set. Call it before anything else is imported,
 * so the logger and the web framework are seen as they load. Returns whether it is on. The
 * compile service has no way out, so its events wait in the outbox for the API (see outbox.ts).
 * The account app's server logs with console, the others with pino.
 */
export function startMonitoring(
  service: "api" | "compile" | "account",
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = loadMonitoringConfig(env);
  if (!config.SENTRY_DSN) return false;
  const logLevels: Level[] =
    config.SENTRY_LOGS === "off"
      ? []
      : LEVELS.slice(LEVELS.indexOf(config.SENTRY_LOGS));
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
    release: config.SENTRY_RELEASE,
    initialScope: { tags: { service } },
    // A tunnel puts the DSN in each envelope's header, which the API checks; the outbox
    // transport keeps the envelope and never opens this address.
    ...(service === "compile"
      ? { transport: outboxTransport, tunnel: "http://outbox.invalid/" }
      : {}),
    // Next.js bundles the account app's server, where these hooks can't find their files. They
    // only serve tracing, which is off.
    ...(service === "account" ? { enableRuntimeChannelInjection: false } : {}),
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: KEPT_HEADERS }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    integrations: [
      service === "account"
        ? Sentry.consoleLoggingIntegration({
            levels: [...new Set(logLevels.map((level) => CONSOLE[level]))],
          })
        : Sentry.pinoIntegration({
            log: { levels: logLevels },
            // Errors that are logged but not thrown, such as a mail that could not be sent.
            error: { levels: ["error", "fatal"] },
          }),
    ],
    beforeSend: (event) => scrubEvent(event),
    beforeSendLog: (log) => scrubLog(log),
  });
  return true;
}

/** Reports an error the server caught, such as one while rendering a page. */
export function reportServerError(error: unknown, tags?: Record<string, string>): void {
  if (Sentry.getClient()) Sentry.captureException(error, tags ? { tags } : undefined);
}

/** Sends what is still queued; call before the process exits. */
export async function stopMonitoring(): Promise<void> {
  if (Sentry.getClient()) await Sentry.close(2000);
}
