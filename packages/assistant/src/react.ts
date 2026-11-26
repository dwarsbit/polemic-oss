import { useEffect, useState, useSyncExternalStore } from "react";
import { Conversation, type ConversationOptions } from "./conversation";

/**
 * One conversation for a component, kept across renders. `send`, `kit` and
 * `system` may change between renders: the next question takes the latest.
 */
export function useConversation<A = never>(options: ConversationOptions<A>) {
  const [conversation] = useState(() => new Conversation<A>(options));
  const entries = useSyncExternalStore(
    (listener) => conversation.subscribe(listener),
    () => conversation.entries,
  );
  useEffect(() => conversation.configure(options));
  useEffect(() => () => conversation.stop(), [conversation]);
  return { conversation, entries, working: conversation.working };
}

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The shortcut that opens the assistant in every app, as the person's keyboard writes it. */
export function shortcutLabel(): string {
  return isMac() ? "⌘J" : "Ctrl+J";
}

/** Cmd+J on a Mac, Ctrl+J elsewhere: opens or closes the assistant. */
export function useAskShortcut(onToggle: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "j" || e.shiftKey || e.altKey) return;
      if (!(isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)) return;
      e.preventDefault();
      onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle, enabled]);
}
