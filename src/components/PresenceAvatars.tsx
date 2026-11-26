import { useMemo } from "react";
import { Faces, onePerPerson } from "@scholarkit/collab";
import { usePresenceStore } from "@/store/presence";
import { useProjectStore } from "@/store/project";

/**
 * Who else has the project open (online): one face per person, in
 * their color. Hovering one says which file they're in; clicking it
 * opens that file.
 */
export function PresenceAvatars() {
  const peers = usePresenceStore((s) => s.peers);
  const openFile = useProjectStore((s) => s.openFile);
  const activeFile = useProjectStore((s) => s.activeFile);

  // presence.ts already leaves out this account's own tabs.
  const people = useMemo(
    () =>
      onePerPerson(
        peers.map((peer) => ({ id: peer.userId, name: peer.name, where: peer.file })),
        null,
      ),
    [peers],
  );

  return (
    <Faces
      people={people}
      here={activeFile}
      onOpen={(person) => {
        if (person.where) void openFile(person.where);
      }}
    />
  );
}
