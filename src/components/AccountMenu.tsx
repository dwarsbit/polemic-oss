import { errorText } from "@/lib/error-text";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { ExternalLink, LogOut, UserRound } from "lucide-react";
import { Avatar, planName, UsageMeters } from "@/components/AccountParts";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountSignOut, accountUsage, type AccountUsage } from "@/lib/tauri";
import { useAccountStore } from "@/store/account";
import { usePreviewStore } from "@/store/preview";
import { t, tn } from "@scholarkit/i18n";

/**
 * The signed-in account at the toolbar's right end: the avatar opens
 * who is signed in, the plan with its usage, the account page and
 * Sign out. Nothing shows while signed out.
 */
export function AccountMenu() {
  const status = useAccountStore((s) => s.status);
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<AccountUsage | null>(null);

  useEffect(() => {
    void useAccountStore.getState().refresh();
  }, []);

  // Fresh numbers each time the menu opens: compiles add up meanwhile.
  const userId = status?.signedIn ? status.user?.id : undefined;
  useEffect(() => {
    if (!open || !userId) return;
    let live = true;
    accountUsage()
      .then((u) => live && setUsage(u))
      .catch(() => {
        // The menu still works; the meters wait for the next open.
      });
    return () => {
      live = false;
    };
  }, [open, userId]);

  if (!status?.signedIn) return null;
  const user = status.user;
  const plan = user?.plan ? planName(user.plan) : null;
  const links = usage?.reviewLinks;

  async function signOut() {
    try {
      await accountSignOut();
      setUsage(null);
    } catch (e) {
      usePreviewStore.getState().setNotice(errorText(e));
    }
    await useAccountStore.getState().refresh();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-1 rounded-full outline-hidden ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          title={user ? `${user.name} (${user.email})` : t("Scholarkit account")}
          aria-label={t("Scholarkit account")}
        >
          <Avatar name={user?.name} photo={status.avatar} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="flex items-center gap-3 px-3 pt-2 pb-3">
          <Avatar name={user?.name} photo={status.avatar} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {user?.name ?? t("Signed in")}
            </p>
            {user && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          {plan && <Badge variant="secondary">{plan}</Badge>}
        </div>
        {status.problem && (
          <p className="px-3 pb-3 text-xs text-muted-foreground">{status.problem}</p>
        )}
        {usage && (
          <>
            <DropdownMenuSeparator className="mt-0" />
            <div className="px-3 py-2">
              <UsageMeters usage={usage} className="space-y-3" />
              {links && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {links.limit === null
                    ? t("Unlimited review links")
                    : tn(
                        links.limit,
                        "{active} of {count} active review link",
                        "{active} of {count} active review links",
                        { active: links.count },
                      )}
                </p>
              )}
            </div>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void openUrl(`${status.server}/account`)}>
          <UserRound />
          {t("Manage account")}
          <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut />
          {t("Sign out")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
