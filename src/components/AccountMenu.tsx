import { errorText } from "@/lib/error-text";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect } from "react";
import { AccountMenu as Menu } from "@scholarkit/account-menu";
import { isWeb } from "@/lib/target";
import { accountSignOut, accountUsage } from "@/lib/tauri";
import { useAccountStore } from "@/store/account";
import { usePreviewStore } from "@/store/preview";

/**
 * The signed-in account at the toolbar's right end, the same menu as in Cursive, Binder and on
 * the Scholarkit home page: who is signed in, the plan with its usage, Upgrade, the account page
 * and Sign out. Nothing shows while signed out.
 */
export function AccountMenu() {
  const status = useAccountStore((s) => s.status);

  useEffect(() => {
    void useAccountStore.getState().refresh();
  }, []);

  if (!status?.signedIn) return null;
  const user = status.user;

  /** In the browser the account page is on this site; the desktop app opens it in the browser. */
  const openAccountPage = (path: string) => {
    if (isWeb) window.location.assign(path);
    else void openUrl(`${status.server}${path}`);
  };

  async function signOut() {
    try {
      await accountSignOut();
    } catch (e) {
      usePreviewStore.getState().setNotice(errorText(e));
    }
    await useAccountStore.getState().refresh();
  }

  return (
    <Menu
      account={
        user && {
          name: user.name,
          email: user.email,
          photo: status.avatar ?? user.image,
        }
      }
      plan={user?.plan}
      loadUsage={accountUsage}
      problem={status.problem}
      external={!isWeb}
      onManage={() => openAccountPage("/account")}
      onUpgrade={() => openAccountPage("/account#plan")}
      onSignOut={signOut}
    />
  );
}
