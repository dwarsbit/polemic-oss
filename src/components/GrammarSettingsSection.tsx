import { errorText } from "@/lib/error-text";
import { useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleButton } from "@/components/ui/toggle-button";
import { ToggleButtonGroup } from "@/components/ui/toggle-button-group";
import { useGrammarStatus } from "@/lib/grammar-check";
import { features } from "@/lib/target";
import {
  accountStatus,
  grammarRules,
  type AccountStatus,
  type GrammarProvider,
  type GrammarRule,
  type GrammarSettings,
} from "@/lib/tauri";
import { useSettingsStore } from "@/store/settings";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

/** The public LanguageTool service (opt-in: the text leaves the machine). */
const PUBLIC_LANGUAGETOOL = "https://api.languagetool.org/v2";

/** The checker in use; settings from before the choice pick it by URL. */
export function grammarProvider(grammar: GrammarSettings): GrammarProvider {
  return grammar.provider ?? (grammar.languageToolUrl ? "languagetool" : "builtin");
}

/**
 * The grammar checker and its rules: the built-in checker (English,
 * offline), Polemic's (LanguageTool on the account's server, on every
 * plan) or the user's own LanguageTool server, and
 * switches for individual rules.
 */
export function GrammarSettingsSection() {
  const grammar = useSettingsStore((s) => s.grammar);
  const setGrammar = useSettingsStore((s) => s.setGrammar);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const problem = useGrammarStatus((s) => s.problem);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [url, setUrl] = useState(() => grammar.languageToolUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const provider = grammarProvider(grammar);

  useEffect(() => {
    if (!features.grammarChoice) return;
    let live = true;
    accountStatus()
      .then((s) => live && setAccount(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function choose(next: GrammarProvider) {
    setError(null);
    try {
      await setGrammar({ ...grammar, provider: next });
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function saveUrl(next: string) {
    setError(null);
    try {
      await setGrammar({
        ...grammar,
        provider: "languagetool",
        languageToolUrl: next.trim() || null,
      });
    } catch (e) {
      setError(errorText(e));
      return;
    }
    setUrl(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const signedIn = account?.signedIn === true;
  const accountPage = account ? `${account.server}/account` : null;

  // Online, Polemic's checker is the only one.
  if (!features.grammarChoice) {
    return (
      <div className="space-y-4 py-4">
        {problem && (
          <p className="text-xs text-destructive" role="status">
            {problem.message}
          </p>
        )}
        <GrammarRulesList />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <ToggleButtonGroup
          type="single"
          value={provider}
          onValueChange={(value) => {
            if (
              value === "builtin" ||
              value === "polemic" ||
              value === "languagetool"
            ) {
              void choose(value);
            }
          }}
        >
          <ToggleButton value="builtin" size="sm">
            {t("Built in")}
          </ToggleButton>
          <ToggleButton
            value="polemic"
            size="sm"
            disabled={!signedIn && provider !== "polemic"}
            title={signedIn ? undefined : t("Sign in to your Scholarkit account first")}
          >
            {t("Polemic")}
          </ToggleButton>
          <ToggleButton value="languagetool" size="sm">
            {t("LanguageTool server")}
          </ToggleButton>
        </ToggleButtonGroup>

        {provider === "builtin" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Offline and English only.")}
            {!signedIn && (
              <>
                {" "}
                {rich(
                  "With a free Scholarkit account, Polemic checks every language: <0>sign in</0>.",
                  [
                    (c) => (
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => openSettings("account")}
                      >
                        {c}
                      </button>
                    ),
                  ],
                )}
              </>
            )}
          </p>
        )}

        {provider === "polemic" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {signedIn || account === null ? (
              <>
                {account?.server
                  ? t("Every language, checked on {server}. Included on every plan.", {
                      server: account.server,
                    })
                  : t(
                      "Every language, checked on your Scholarkit server. Included on every plan.",
                    )}
              </>
            ) : (
              <>
                {rich(
                  "You are not signed in. <0>Sign in</0> to your Scholarkit account, or pick another checker.",
                  [
                    (c) => (
                      <button
                        type="button"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => openSettings("account")}
                      >
                        {c}
                      </button>
                    ),
                  ],
                )}
              </>
            )}
          </p>
        )}

        {provider === "languagetool" && (
          <div className="mt-3">
            <label className="text-xs text-muted-foreground" htmlFor="languagetool-url">
              {t("Server, up to /v2")}
            </label>
            <div className="mt-1 flex gap-2">
              <Input
                id="languagetool-url"
                placeholder="http://localhost:8081/v2"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button variant="outline" size="sm" onClick={() => void saveUrl(url)}>
                {saved ? t("Saved") : t("Save")}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {grammar.languageToolUrl
                ? t("Checks every language.")
                : t("Until a server is set, the built-in checker runs.")}{" "}
              {rich(
                "Run one locally, or <0>use the public LanguageTool service</0>, which sends your paragraphs to languagetool.org.",
                [
                  (c) => (
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => void saveUrl(PUBLIC_LANGUAGETOOL)}
                    >
                      {c}
                    </button>
                  ),
                ],
              )}
            </p>
          </div>
        )}

        {provider !== "builtin" && problem && (
          <p className="mt-2 text-xs text-destructive" role="status">
            {problem.message}
            {problem.kind === "planRequired" && accountPage && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => void openUrl(accountPage)}
                >
                  {t("See plans")}
                </button>
              </>
            )}
            {problem.kind === "signedOut" && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => openSettings("account")}
                >
                  {t("Account settings")}
                </button>
              </>
            )}
          </p>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <GrammarRulesList />
    </div>
  );
}

/** Switches for individual rules: the switched-off ones first, then a
 *  search over the built-in checker's rules. */
function GrammarRulesList() {
  const grammar = useSettingsStore((s) => s.grammar);
  const setGrammar = useSettingsStore((s) => s.setGrammar);
  const [rules, setRules] = useState<GrammarRule[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    grammarRules()
      .then((list) => {
        if (!cancelled) setRules(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const disabled = useMemo(() => new Set(grammar.disabledRules), [grammar]);
  const descriptions = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule.description])),
    [rules],
  );
  const q = query.trim().toLowerCase();
  const matches =
    q.length === 0
      ? []
      : rules
          .filter(
            (rule) =>
              !disabled.has(rule.id) &&
              `${rule.id} ${rule.description}`.toLowerCase().includes(q),
          )
          .slice(0, 30);

  const toggle = (id: string, on: boolean) => {
    const next = new Set(grammar.disabledRules);
    if (on) next.delete(id);
    else next.add(id);
    void setGrammar({ ...grammar, disabledRules: [...next].sort() });
  };

  const row = (id: string, on: boolean) => (
    <li key={id} className="flex items-start gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs">{id}</p>
        {descriptions.get(id) && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {descriptions.get(id)}
          </p>
        )}
      </div>
      <Switch checked={on} onCheckedChange={(v) => toggle(id, v)} />
    </li>
  );

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        {rules.length > 0
          ? t(
              "Rules switched off ({count}). Right-click an underline and pick “Turn off this rule”, or find one here.",
              { count: grammar.disabledRules.length },
            )
          : t(
              "Rules switched off ({count}). Right-click an underline and pick “Turn off this rule”.",
              { count: grammar.disabledRules.length },
            )}
      </p>
      {grammar.disabledRules.length > 0 && (
        <ul className="mt-1 divide-y">
          {grammar.disabledRules.map((id) => row(id, false))}
        </ul>
      )}
      {rules.length > 0 && (
        <Input
          className="mt-2"
          placeholder={t("Find a rule (e.g. passive, comma, article)")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {matches.length > 0 && (
        <ul className="mt-1 max-h-64 divide-y overflow-y-auto">
          {matches.map((rule) => row(rule.id, true))}
        </ul>
      )}
    </div>
  );
}
