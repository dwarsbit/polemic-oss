/**
 * Presence in the browser build, on the open project's connection (see
 * lib/live-presence.ts).
 */

import { attachPresence, startPresenceReporter } from "@/lib/live-presence";
import { onProjectConnect, signedInAccount } from "@/web/projects";

export { peersOf } from "@/lib/live-presence";

/** Shares presence for whichever project is open; returns a stop. */
export function startPresence(): () => void {
  let detach = () => {};
  const stopReporter = startPresenceReporter();
  const stopConnect = onProjectConnect((open) => {
    detach();
    detach = open
      ? attachPresence(open, async () => (await signedInAccount())?.id ?? null)
      : () => {};
  });
  return () => {
    stopConnect();
    detach();
    stopReporter();
  };
}
