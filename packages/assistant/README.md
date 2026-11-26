# @scholarkit/assistant

The assistant of every app: Polemic, Cursive and Binder. It looks and works the same everywhere; each app gives it its own tools.

- `src/agent.ts`: the loop. It sends the conversation and the tools to the model, runs the tool calls it asks for, feeds the results back and repeats until the model answers in text (at most `MAX_STEPS` turns). Every call gets an answer, even after Stop, so the history stays valid.
- `src/tools.ts`: the tools contract. A tool is `read` (looks, changes nothing, runs right away), `propose` (prepares a change and hands the person a card to review; never writes) or `ask` (runs only once the person allows it, such as a compile). A tool answers the model in text and may hand the panel an attachment, such as its card.
- `src/transport.ts`: our model. `serverTurn` sends each turn to `POST /api/assistant/turn` and reads the streamed answer; `loadAccess` asks `GET /api/assistant/access`. The server's notices become `AssistantError` codes, and `errorMessage` says them in the active language. An own key or a local model is another `SendTurn` the app passes in; those never reach our server. See "Assistant" in `docs/services.md`.
- `src/conversation.ts`: a conversation as the panel shows it (questions, steps, text, cards) beside the history the model reads. `useConversation` in `src/react.ts` wraps it for components, and `useAskShortcut` opens the assistant with Cmd+J (Ctrl+J on Windows and Linux).
- Two layouts, one conversation. Floating is the default (`DEFAULT_LAYOUT`): `AssistantFloating` puts `AskBar` at the bottom of the work area with the latest answer in a sheet above it, its steps and cards included. Docked is the alternative: `AssistantPanel` on the right with the whole conversation. The sheet opens the panel, and the panel's button goes back to floating; the app keeps the choice.
- The parts: `AssistantPanel` (the docked panel, with modes such as Polemic's LaTeX and Writing), `ConversationView`, `Composer`, `StepList`, `UsageLine`, `AskButton` (next to the avatar), `SelectionMenu` (Ask on a selection), and the cards `DiffCard`, `PaperCard`, `SourceQuote` and `AnswerActions`. `lineDiff` makes a card's diff, and `AssistantText` shows answers in a small, safe part of Markdown.
- `src/assistant.css`: the styles. Import it in the app's CSS. It is plain CSS on the apps' own tokens (`--tint`, `--tint-soft`, `--tint-edge`, `--tint-foreground`, `--muted`, `--border` and the others of the Polemic UI kit), so each app shows the assistant in its own color and in dark mode. `--assistant-glow` sets the mark's second color.

`pnpm demo` shows every part with sample answers: `?app=polemic|cursive|binder&theme=light|dark&view=floating|panel|menu`.

The wire types in `src/types.ts` match the server's contract in `@scholarkit/contracts`, which the apps' public repositories don't have.

The package is MIT, as Polemic is, so Cursive and Binder (GPL-3.0) can use it too.
