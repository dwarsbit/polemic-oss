/**
 * The browser build's start: the loading screen first, and the app once
 * the page has a signed-in account. Signed out goes to the sign-in page; when Polemic
 * can't say who is signed in, the page says so instead.
 */

import React, { type ReactNode } from "react";
import type { Root } from "react-dom/client";
import { LoadingScreen } from "@/components/LoadingScreen";
import { requireAccount } from "@/web/projects";
import { StartError } from "@/web/StartError";

export async function startWeb(root: Root, app: ReactNode): Promise<void> {
  // The loading screen the app opens with, while the account is looked up.
  root.render(<LoadingScreen />);
  try {
    await requireAccount();
  } catch (e) {
    root.render(<StartError message={String(e)} />);
    return;
  }
  root.render(<React.StrictMode>{app}</React.StrictMode>);
}
