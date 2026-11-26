/**
 * The account commands in the browser: the services app's session
 * stands in for the desktop app's sign-in. Signing in happens before
 * the editor shows (src/web/start.tsx), so these only read the account
 * and sign out.
 */

import { errorText } from "@/lib/error-text";
import type {
  AccountStatus,
  AccountUsage,
  AccountUser,
  LookupAnswer,
} from "@/lib/tauri";
import { t } from "@scholarkit/i18n";
import { request, ServerError } from "@/web/server";

async function status(): Promise<AccountStatus> {
  const server = window.location.origin;
  try {
    const user = await request<AccountUser>("/api/me");
    return { server, signedIn: true, user, problem: null, avatar: user.image ?? null };
  } catch (e) {
    // Signed in (the page needs it), but who it is can't be said now.
    const problem = errorText(e);
    return { server, signedIn: true, user: null, problem, avatar: null };
  }
}

async function usage(): Promise<AccountUsage | null> {
  try {
    return await request<AccountUsage>("/api/usage");
  } catch (e) {
    // A server without plans has no usage to show.
    if (e instanceof ServerError && e.status === 404) return null;
    throw e;
  }
}

/** An /api/lookup/ path, with the status and body as the desktop command answers them. */
async function lookup(args: Record<string, unknown>): Promise<LookupAnswer> {
  const path = String(args.path ?? "");
  if (!path.startsWith("/api/lookup/"))
    throw new Error("Only lookups go through here.");
  let response: Response;
  try {
    response = await fetch(path, { credentials: "same-origin" });
  } catch {
    throw new ServerError(0, "unreachable", t("Could not reach Polemic."));
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: a proxy's page.
  }
  return { status: response.status, body };
}

async function signOut(): Promise<void> {
  await request("/api/auth/sign-out", { method: "POST", json: {} });
  window.location.assign("/sign-in");
}

export const accountCommands = {
  account_status: status,
  account_usage: usage,
  account_lookup: lookup,
  account_sign_out: signOut,
};
