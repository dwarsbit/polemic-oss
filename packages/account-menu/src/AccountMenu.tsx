import { formatNumber, t as activeT, tn as activeTn } from "@scholarkit/i18n";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  formatBytes,
  initialsOf,
  planName,
  upgradeFrom,
  type AccountUsage,
  type MenuTranslator,
} from "./format";

const ACTIVE: MenuTranslator = { t: activeT, tn: activeTn, formatNumber };

/** Who is signed in, as the menu shows them. */
export interface MenuAccount {
  name: string;
  email: string;
  /** The sign-in photo, as a URL the app can show; without one the avatar shows the initials. */
  photo?: string | null;
}

/** A row an app adds above Manage account, such as syncing the open project in the desktop apps. */
export interface MenuAction {
  label: string;
  icon: ReactNode;
  /** The menu closes when it resolves, and shows the error when it throws. */
  run: () => Promise<void>;
}

export interface AccountMenuProps {
  /** The signed-in account; null while its name can't be fetched. */
  account: MenuAccount | null;
  /** The plan as /api/me gives it; the usage's plan wins once the menu has opened. */
  plan?: string | null;
  /** Fetches GET /api/usage; called each time the menu opens, as compiles and uploads add up meanwhile. */
  loadUsage?: () => Promise<AccountUsage | null>;
  /** Why the account can't be fetched now (offline, expired sign-in). */
  problem?: string | null;
  /** A line about the open project, above its actions: "This project syncs with your account." */
  note?: string;
  actions?: MenuAction[];
  onManage: () => void;
  /** Whether the account page opens in the browser, outside the app. */
  external?: boolean;
  /** Opens the plan on the account page; without it there is no upgrade row. */
  onUpgrade?: () => void;
  onSignOut: () => Promise<void> | void;
  /** Where the avatar sits: the end of a header, or a row at the foot of a list. */
  place?: "header" | "row";
  /** For pages that translate per request; the apps leave it out and get the active language. */
  translator?: MenuTranslator;
}

const ICON = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// Lucide's user-round, log-out, external-link and circle-arrow-up (ISC).
const UserIcon = () => (
  <svg {...ICON}>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);
const SignOutIcon = () => (
  <svg {...ICON}>
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
  </svg>
);
const ExternalIcon = () => (
  <svg {...ICON}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </svg>
);
const UpgradeIcon = () => (
  <svg {...ICON}>
    <circle cx="12" cy="12" r="10" />
    <path d="m16 12-4-4-4 4" />
    <path d="M12 16V8" />
  </svg>
);

/** The sign-in photo, else the initials on the app's color, else a person icon. */
export function Avatar({
  name,
  photo,
  size = "sm",
}: {
  name?: string;
  photo?: string | null;
  /** xs 20px (a list row), sm 28px (a header), md 36px (the menu). */
  size?: "xs" | "sm" | "md";
}) {
  const [broken, setBroken] = useState(false);
  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt=""
        className="account-menu-avatar"
        data-size={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  const initials = name ? initialsOf(name) : "";
  return (
    <span
      aria-hidden
      className="account-menu-avatar"
      data-size={size}
      data-empty={initials ? undefined : ""}
    >
      {initials || <UserIcon />}
    </span>
  );
}

function Meter({
  label,
  value,
  share,
  full,
  note,
}: {
  label: string;
  value: string;
  share: number;
  full: boolean;
  /** Shown under the bar once it is full. */
  note?: string;
}) {
  return (
    <div className="account-menu-meter" data-full={full ? "" : undefined}>
      <div className="account-menu-meter-head">
        <span className="account-menu-meter-label">{label}</span>
        <span className="account-menu-meter-value">{value}</span>
      </div>
      <div className="account-menu-track">
        <div
          className="account-menu-fill"
          style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
        />
      </div>
      {full && note && <p className="account-menu-note">{note}</p>}
    </div>
  );
}

/** Storage against the plan, the share of today's cloud compile used and the active review links. */
export function UsageMeters({
  usage,
  translator = ACTIVE,
}: {
  usage: AccountUsage;
  translator?: MenuTranslator;
}) {
  const { t, tn } = translator;
  const { storage, compile, reviewLinks } = usage;
  return (
    <div className="account-menu-usage">
      <Meter
        label={t("Storage")}
        value={t("{used} of {limit}", {
          used: formatBytes(storage.usedBytes, translator),
          limit: formatBytes(storage.limitBytes, translator),
        })}
        share={storage.limitBytes > 0 ? storage.usedBytes / storage.limitBytes : 1}
        full={storage.usedBytes >= storage.limitBytes}
      />
      <Meter
        label={t("Cloud compile today")}
        value={t("{percent}% used", { percent: compile.usedPercent })}
        share={compile.usedPercent / 100}
        full={compile.usedPercent >= 100}
        note={t("More from midnight UTC")}
      />
      <p className="account-menu-note">
        {reviewLinks.limit === null
          ? t("Unlimited review links")
          : tn(
              reviewLinks.limit,
              "{active} of {count} active review link",
              "{active} of {count} active review links",
              { active: reviewLinks.count },
            )}
      </p>
    </div>
  );
}

/**
 * The signed-in account at the end of the header, the same in every app and on the Scholarkit
 * home page: the avatar opens who is signed in, the plan with its usage, the app's own rows
 * (syncing the open project in the desktop apps), Upgrade, the account page and Sign out.
 * The colors are the page's own tokens, so each app shows it in its own color.
 */
export function AccountMenu({
  account,
  plan,
  loadUsage,
  problem: accountProblem,
  note,
  actions = [],
  onManage,
  external = false,
  onUpgrade,
  onSignOut,
  place = "header",
  translator = ACTIVE,
}: AccountMenuProps) {
  const { t } = translator;
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<AccountUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // Fresh numbers each time the menu opens. The last ones stay while they come in.
  useEffect(() => {
    if (!open || !loadUsage) return;
    let live = true;
    loadUsage()
      .then((next) => {
        if (live) setUsage(next);
      })
      .catch(() => {
        // The menu works without the meters; they come back with the next open.
      });
    return () => {
      live = false;
    };
  }, [open, loadUsage]);

  const shownPlan = usage?.plan ?? plan ?? null;
  const upgrade = onUpgrade ? upgradeFrom(shownPlan) : null;

  /** Runs a row's work. The menu closes when it worked, and says why when it didn't. */
  const run = async (work: () => Promise<void> | void) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      setOpen(false);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const items = () =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    ].filter((item) => !item.hasAttribute("disabled"));

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const list = items();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement as HTMLElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    list[(at + step + list.length) % list.length]?.focus();
  };

  const row = place === "row";
  const title = account
    ? `${account.name} (${account.email})`
    : t("Scholarkit account");

  return (
    <div ref={root} className="account-menu" data-place={place} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={row ? undefined : t("Scholarkit account")}
        title={title}
        onClick={() => {
          setProblem(null);
          setOpen(!open);
        }}
        className={row ? "account-menu-row" : "account-menu-trigger"}
      >
        <Avatar name={account?.name} photo={account?.photo} size={row ? "xs" : "sm"} />
        {row && (
          <span className="account-menu-grow account-menu-truncate">
            {account?.name ?? t("Scholarkit account")}
          </span>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("Scholarkit account")}
          className="account-menu-card"
        >
          <div className="account-menu-who">
            <Avatar name={account?.name} photo={account?.photo} size="md" />
            <div className="account-menu-grow">
              <p className="account-menu-name account-menu-truncate">
                {account?.name ?? t("Signed in")}
              </p>
              {account && (
                <p className="account-menu-email account-menu-truncate">
                  {account.email}
                </p>
              )}
            </div>
            {shownPlan && (
              <span className="account-menu-plan">
                {planName(shownPlan, translator)}
              </span>
            )}
          </div>
          {accountProblem && <p className="account-menu-hint">{accountProblem}</p>}
          {usage && (
            <>
              <div className="account-menu-sep" data-first="" />
              <UsageMeters usage={usage} translator={translator} />
            </>
          )}
          {(note || actions.length > 0) && (
            <>
              <div className="account-menu-sep" />
              {note && <p className="account-menu-hint">{note}</p>}
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="account-menu-item"
                  disabled={busy}
                  onClick={() => void run(action.run)}
                >
                  {action.icon}
                  <span className="account-menu-grow">{action.label}</span>
                </button>
              ))}
            </>
          )}
          {problem && (
            <p className="account-menu-problem" role="alert">
              {problem}
            </p>
          )}
          {upgrade && (
            <>
              <div className="account-menu-sep" />
              <button
                type="button"
                role="menuitem"
                className="account-menu-item"
                onClick={() => {
                  onUpgrade?.();
                  setOpen(false);
                }}
              >
                <UpgradeIcon />
                <span className="account-menu-grow">
                  {upgrade === "plus" ? t("Upgrade to Plus") : t("Upgrade to Pro")}
                </span>
                {external && <ExternalIcon />}
              </button>
            </>
          )}
          <div className="account-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            onClick={() => {
              onManage();
              setOpen(false);
            }}
          >
            <UserIcon />
            <span className="account-menu-grow">{t("Manage account")}</span>
            {external && <ExternalIcon />}
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            disabled={busy}
            onClick={() => void run(onSignOut)}
          >
            <SignOutIcon />
            <span className="account-menu-grow">{t("Sign out")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
