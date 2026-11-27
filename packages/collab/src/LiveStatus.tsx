import { liveStatus, type LiveConnection } from "./status";
import { useSettledConnection } from "./useSettledConnection";

/**
 * The status line's part for a shared project: "Live with Anna and Tom",
 * or "Reconnecting… Your changes are kept." once the connection has been gone for 2 s. Nothing when nobody else is
 * in and the connection is up, so the app's own "Saved" shows.
 */
export function LiveStatus({
  names,
  connection,
  readOnly,
}: {
  names: string[];
  connection: LiveConnection;
  readOnly?: boolean;
}) {
  const settled = useSettledConnection(connection);
  const status = liveStatus({ names, connection: settled, readOnly });
  if (!status) return null;
  return (
    <span className="collab-status" data-tone={status.tone} role="status">
      <span className="collab-status-dot" aria-hidden="true" />
      <span className="collab-status-text">{status.text}</span>
    </span>
  );
}
