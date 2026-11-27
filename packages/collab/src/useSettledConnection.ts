import { useEffect, useState } from "react";
import type { LiveConnection } from "./status";

/**
 * How long a lost connection stays quiet before "Reconnecting…" shows. A deploy moves every
 * editor to another copy of the API, which takes well under this; a real outage takes longer.
 */
export const RECONNECTING_AFTER_MS = 2000;

/**
 * The connection as the status line shows it: "connecting" only once it has lasted
 * RECONNECTING_AFTER_MS, so a quick reconnect shows nothing.
 */
export function useSettledConnection(
  connection: LiveConnection,
  after: number = RECONNECTING_AFTER_MS,
): LiveConnection {
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (connection === "connected") return;
    const timer = setTimeout(() => setLate(true), after);
    return () => {
      clearTimeout(timer);
      setLate(false);
    };
  }, [connection, after]);
  return connection === "connecting" && late ? "connecting" : "connected";
}
