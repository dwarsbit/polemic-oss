import { errorText } from "@/lib/error-text";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  gitAccountRemove,
  gitAccountSave,
  gitAccounts,
  HOSTING_NAMES,
  signInAvailable,
  signInCancel,
  signInFinish,
  signInStart,
  type GitAccountView,
  type Hosting,
  type SignIn,
} from "@/lib/tauri";
import { t } from "@scholarkit/i18n";

/** Where a token comes from on the hosts people use most. */
const TOKEN_HINTS: [string, string][] = [
  [
    "github.com",
    t(
      "GitHub: Settings → Developer settings → Personal access tokens, with the repo scope.",
    ),
  ],
  [
    "gitlab.com",
    t(
      "GitLab: Preferences → Access tokens, with read_repository and write_repository.",
    ),
  ],
  [
    "git.overleaf.com",
    t("Overleaf: Account settings → Git integration; the username is git."),
  ],
];

export function tokenHint(host: string): string | null {
  const h = host.trim().toLowerCase();
  return (
    TOKEN_HINTS.find(([known]) => h === known || h.endsWith(`.${known}`))?.[1] ?? null
  );
}

type Form = { id?: string; host: string; username: string; token: string };

const EMPTY: Form = { host: "", username: "git", token: "" };

/**
 * The git accounts: one token per host for private remotes over
 * HTTPS. The token goes straight to the Rust side and the credential
 * store; this page only ever learns whether one is set.
 */
export function GitAccountsSection() {
  const [accounts, setAccounts] = useState<GitAccountView[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The hosts this build can sign in to. */
  const [hosts, setHosts] = useState<Hosting[]>([]);
  /** The code waiting to be typed on the host's page, while signing in. */
  const [pending, setPending] = useState<{ provider: Hosting; code: SignIn } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    gitAccounts()
      .then((list) => live && setAccounts(list))
      .catch((e) => live && setError(errorText(e)));
    const all: Hosting[] = ["github", "gitlab"];
    Promise.all(all.map((h) => signInAvailable(h).catch(() => false)))
      .then((available) => live && setHosts(all.filter((_, i) => available[i])))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function signInWith(provider: Hosting) {
    setError(null);
    setBusy(true);
    try {
      setPending({ provider, code: await signInStart(provider) });
      setCopied(false);
      // Resolves once the code is entered on the host's page.
      setAccounts(await signInFinish(provider));
    } catch (e) {
      const message = errorText(e);
      if (!message.includes("Sign-in cancelled")) setError(message);
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  async function run(action: () => Promise<GitAccountView[]>) {
    setBusy(true);
    setError(null);
    try {
      setAccounts(await action());
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form) return;
    const saved = await run(() =>
      gitAccountSave({
        id: form.id,
        host: form.host,
        username: form.username,
        token: form.token.trim() === "" ? undefined : form.token,
      }),
    );
    if (saved) setForm(null);
  }

  const canSave =
    form !== null &&
    form.host.trim() !== "" &&
    form.username.trim() !== "" &&
    (form.id !== undefined || form.token.trim() !== "") &&
    !busy;
  const hint = form ? tokenHint(form.host) : null;

  return (
    <div className="space-y-3 py-4">
      {accounts === null && !error && (
        <p className="text-sm text-muted-foreground">{t("Loading…")}</p>
      )}
      {accounts !== null && accounts.length === 0 && form === null && (
        <p className="text-sm text-muted-foreground">
          {t("No accounts yet. Public remotes and SSH remotes work without one.")}
        </p>
      )}
      {accounts !== null && accounts.length > 0 && (
        <ul className="divide-y rounded-lg border bg-background">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{account.host}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {account.name ?? account.username}
                  {" · "}
                  {account.hasToken ? t("token set") : t("no token")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("Change the username or token")}
                  disabled={busy}
                  onClick={() =>
                    setForm({
                      id: account.id,
                      host: account.host,
                      username: account.username,
                      token: "",
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  title={t("Remove the account and forget its token")}
                  disabled={busy}
                  onClick={() => void run(() => gitAccountRemove(account.id))}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending !== null && (
        <div
          className="space-y-2 rounded-lg border bg-background px-3 py-3"
          aria-live="polite"
        >
          <p className="text-sm">
            {t("Enter this code on {value}, in the page that opened in your browser:", {
              value: HOSTING_NAMES[pending.provider],
            })}
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-accent px-2 py-1 font-mono text-base tracking-widest">
              {pending.code.userCode}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("Copy the code")}
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(pending.code.userCode)
                  .then(() => setCopied(true))
                  .catch(() => undefined);
              }}
            >
              <Copy />
            </Button>
            {copied && (
              <span className="text-xs text-muted-foreground">{t("Copied")}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Not open? Go to {verificationUri}. Waiting for {value}…", {
              verificationUri: pending.code.verificationUri,
              value: HOSTING_NAMES[pending.provider],
            })}
          </p>
          <Button variant="outline" size="sm" onClick={() => void signInCancel()}>
            {t("Cancel")}
          </Button>
        </div>
      )}

      {form === null && pending === null ? (
        <div className="flex flex-wrap gap-2">
          {hosts.map((provider) => (
            <Button
              key={provider}
              size="sm"
              disabled={busy || accounts === null}
              title={t("Sign in on {value}; the token is kept as its git account", {
                value: HOSTING_NAMES[provider],
              })}
              onClick={() => void signInWith(provider)}
            >
              {t("Sign in with {value}", { value: HOSTING_NAMES[provider] })}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            disabled={busy || accounts === null}
            onClick={() => setForm(EMPTY)}
          >
            <Plus />
            {t("Add account")}
          </Button>
        </div>
      ) : form === null ? null : (
        <div className="space-y-2 rounded-lg border bg-background px-3 py-3">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="git-host">
              {t("Host")}
            </label>
            <Input
              id="git-host"
              className="mt-1"
              placeholder="github.com"
              autoFocus={form.id === undefined}
              disabled={form.id !== undefined}
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="git-username">
              {t("Username")}
            </label>
            <Input
              id="git-username"
              className="mt-1"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "What the host expects beside a token. GitHub and GitLab accept any name; Overleaf wants git.",
              )}
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="git-token">
              {t("Token")}
            </label>
            <Input
              id="git-token"
              className="mt-1"
              type="password"
              autoComplete="off"
              placeholder={form.id !== undefined ? t("Unchanged") : ""}
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) void save();
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {hint ??
                t(
                  "A personal access token from the host, allowed to read and write repositories.",
                )}{" "}
              {t("Kept in your system’s credential store.")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={!canSave} onClick={() => void save()}>
              <KeyRound />
              {busy
                ? t("Saving…")
                : form.id !== undefined
                  ? t("Save changes")
                  : t("Add account")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setForm(null);
                setError(null);
              }}
            >
              {t("Cancel")}
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
