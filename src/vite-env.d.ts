/// <reference types="vite/client" />

/** The app's version from package.json (vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Sentry DSN for error reports; unset: none are sent (src/lib/monitoring.ts). */
  readonly VITE_SENTRY_DSN?: string;
  /** The tunnel reports go through; defaults to the Scholarkit API's. */
  readonly VITE_SENTRY_TUNNEL?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
