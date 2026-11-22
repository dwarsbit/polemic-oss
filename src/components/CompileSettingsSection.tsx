import { errorText } from "@/lib/error-text";
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { ToggleButton } from "@/components/ui/toggle-button";
import { ToggleButtonGroup } from "@/components/ui/toggle-button-group";
import {
  accountStatus,
  cloudCompileStatus,
  type AccountStatus,
  type CloudCompileStatus,
  type CompileError,
  type CompileProvider,
} from "@/lib/tauri";
import { features } from "@/lib/target";
import { usePreviewStore } from "@/store/preview";
import { useSettingsStore } from "@/store/settings";
import { t } from "@scholarkit/i18n";
import { rich } from "@scholarkit/i18n/react";

const link = "underline underline-offset-2 hover:text-foreground";

/**
 * Where compiles run: on this computer with the user's TeX install, or
 * with Polemic on the account's server, on every plan. Says why the
 * server is not an option when signed out, when the server asks for a
 * paid plan, or when it has no cloud compile.
 */
export function CompileSettingsSection() {
  const provider = useSettingsStore((s) => s.compileProvider);
  const setProvider = useSettingsStore((s) => s.setCompileProvider);
  const openSettings = useSettingsStore((s) => s.openSettings);
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [cloud, setCloud] = useState<CloudCompileStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    accountStatus()
      .then(async (status) => {
        if (!live) return;
        setAccount(status);
        if (!status.signedIn) return;
        const available = await cloudCompileStatus();
        if (live) setCloud(available);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function choose(next: CompileProvider) {
    setError(null);
    try {
      await setProvider(next);
    } catch (e) {
      setError(errorText(e));
    }
  }

  const signedIn = account?.signedIn === true && cloud !== "signedOut";
  const server = account?.server ?? t("your Scholarkit server");
  const accountPage = account ? `${account.server}/account` : null;
  // Servers from before the Free plan answered 402 without a subscription.
  const planRequired = cloud === "planRequired";
  const usable = signedIn && !planRequired && cloud !== "disabled";

  return (
    <div className="space-y-2 py-2">
      <ToggleButtonGroup
        type="single"
        value={provider}
        onValueChange={(value) => {
          if (value === "local" || value === "polemic") void choose(value);
        }}
      >
        <ToggleButton value="local" size="sm">
          {t("On this computer")}
        </ToggleButton>
        <ToggleButton
          value="polemic"
          size="sm"
          disabled={!usable && provider !== "polemic"}
          title={usable ? undefined : t("Needs a Scholarkit account")}
        >
          {t("With Polemic")}
        </ToggleButton>
      </ToggleButtonGroup>

      <p className="text-xs text-muted-foreground" role="status">
        {provider === "local" ? (
          <>
            {t("latexmk and your TeX distribution, below.")}{" "}
            {usable &&
              t("With Polemic, the server compiles and nothing needs to be installed.")}
          </>
        ) : (
          <>
            {t(
              "On {server}, with TeX Live and the same latexmk rules. Fonts installed only on this computer are not there: put their files in the project. Your plan sets the compile time you get each day.",
              { server },
            )}
            {accountPage && (
              <>
                {" "}
                <button
                  type="button"
                  className={link}
                  onClick={() => void openUrl(accountPage)}
                >
                  {t("See your usage")}
                </button>
              </>
            )}
          </>
        )}
      </p>

      {account !== null && !signedIn && (
        <p className="text-xs text-muted-foreground">
          {t("Compiling with Polemic needs a free Scholarkit account.")}{" "}
          {rich("<0>Sign in</0> first.", [
            (c) => (
              <button
                type="button"
                className={link}
                onClick={() => openSettings("account")}
              >
                {c}
              </button>
            ),
          ])}
        </p>
      )}
      {signedIn && planRequired && (
        <p className="text-xs text-muted-foreground">
          {t("Compiling with Polemic needs a paid plan on {server}.", { server })}
          {accountPage && (
            <>
              {" "}
              <button
                type="button"
                className={link}
                onClick={() => void openUrl(accountPage)}
              >
                {t("See plans")}
              </button>
            </>
          )}
        </p>
      )}
      {signedIn && cloud === "disabled" && (
        <p className="text-xs text-muted-foreground">
          {t(
            "{server} has no cloud compile. Ask its administrator, or compile on this computer.",
            { server },
          )}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * What the user can do about a compile error: compile with Polemic when
 * no TeX is installed, sign in, or go back to this computer when the
 * server cannot compile. In the browser, which only compiles with
 * Polemic, a plan's limit links to the account page.
 */
export function CompileErrorActions({ kind }: { kind: CompileError["kind"] | null }) {
  const setProvider = useSettingsStore((s) => s.setCompileProvider);
  const openSettings = useSettingsStore((s) => s.openSettings);

  async function compileOn(provider: CompileProvider) {
    await setProvider(provider);
    await usePreviewStore.getState().compileNow();
  }

  const action = (label: string, run: () => void) => (
    <Button variant="outline" size="sm" onClick={run}>
      {label}
    </Button>
  );

  if (!features.localTex) {
    return kind === "limitReached" || kind === "planRequired"
      ? action(t("See your plan"), () => void openUrl("/account"))
      : null;
  }

  switch (kind) {
    case "noTex":
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {action(t("Compile with Polemic"), () => void compileOn("polemic"))}
          <span className="text-muted-foreground">
            {rich("on Polemic's server, or <0>install TeX</0>.", [
              (c) => (
                <button
                  type="button"
                  className={link}
                  onClick={() => openSettings("tex")}
                >
                  {c}
                </button>
              ),
            ])}
          </span>
        </div>
      );
    case "signedOut":
    case "planRequired":
      return (
        <div className="flex flex-wrap gap-2">
          {action(t("Account settings"), () => openSettings("account"))}
          {action(t("Compile on this computer"), () => void compileOn("local"))}
        </div>
      );
    case "disabled":
    case "limitReached":
      return action(t("Compile on this computer"), () => void compileOn("local"));
    default:
      return null;
  }
}
