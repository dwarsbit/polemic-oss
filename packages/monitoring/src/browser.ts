// Error reports from a page: the account app, the website, and the Polemic, Cursive and Binder
// web and desktop apps. Off without a DSN. Reports go through the API's tunnel, so Sentry never
// sees the user's address, and leave out what can name a person or their work (see scrub.ts):
// no console output, no clicked element, no file names, no replays, no tracing.

import * as Sentry from "@sentry/browser";
import { scrubEvent } from "@scholarkit/monitoring/scrub";

export interface BrowserMonitoringOptions {
  /** The app's Sentry DSN. Unset or empty: nothing is loaded or sent. */
  dsn?: string;
  /** The API's tunnel, e.g. https://app.scholarkit.app/api/monitoring. */
  tunnel?: string;
  /** Tag on every event, e.g. account, website, polemic. */
  app: string;
  /** web or desktop: the same code runs in both. */
  platform?: "web" | "desktop";
  release?: string;
  environment?: string;
  /** Most events one page load sends; a loop that throws stops here, not at the month's quota. */
  maxEvents?: number;
}

/** Errors the page can't do anything about: browser quirks and extensions. */
const IGNORED = [
  /ResizeObserver loop/,
  /^Non-Error promise rejection captured/,
  /^Load failed$/,
  /^Failed to fetch$/,
  /^NetworkError when attempting to fetch resource\.?$/,
];

/** Scripts that aren't ours: browser extensions. */
const DENIED_URLS = [
  /^(?:chrome|moz|safari(?:-web)?)-extension:\/\//i,
  /extensions\//i,
];

const LEFT_OUT = new Set(["Breadcrumbs", "Console", "BrowserSession"]);

let started = false;
/** Whether reports may leave: the desktop apps' "Send error reports" setting. */
let allowed = true;

/** Starts error reporting in this page once; returns whether it is on. */
export function startBrowserMonitoring(options: BrowserMonitoringOptions): boolean {
  if (!options.dsn) return false;
  if (started) return true;
  started = true;
  const maxEvents = options.maxEvents ?? 10;
  let sent = 0;
  Sentry.init({
    dsn: options.dsn,
    tunnel: options.tunnel,
    release: options.release,
    environment: options.environment,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    initialScope: { tags: { app: options.app, platform: options.platform ?? "web" } },
    // The defaults, without console messages (they can hold document text), clicked elements
    // (their labels can hold file names) or a session report on every page and navigation.
    integrations: (defaults) => [
      ...defaults.filter((i) => !LEFT_OUT.has(i.name)),
      Sentry.breadcrumbsIntegration({ dom: false }),
    ],
    ignoreErrors: IGNORED,
    denyUrls: DENIED_URLS,
    maxBreadcrumbs: 30,
    beforeSend(event) {
      if (!allowed || sent >= maxEvents) return null;
      sent++;
      return scrubEvent(event);
    },
  });
  return true;
}

/**
 * Lets reports leave, or holds every one back from now on: for a setting the user changes while
 * the app runs. To send nothing from the start, don't start monitoring at all.
 */
export function allowReports(allow: boolean): void {
  allowed = allow;
}

/** Reports an error the app caught but can't recover from, such as a save that failed. */
export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!started) return;
  Sentry.captureException(error, context ? { tags: context } : undefined);
}
