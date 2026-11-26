# @scholarkit/collab

Working on a shared project together, the same way in Polemic and Cursive: who else is in the project, where they are, and the status line. Binder doesn't use it.

- `src/people.ts`: one color per account (`colorFor`), initials, first names, and `onePerPerson`, which turns the windows on a project into one entry per person.
- `src/Faces.tsx`: `Faces`, the others' faces next to **Share**. Hovering a face names the person and the file or page they're on; clicking it opens that file or page. `Face` is one person's initials in their color.
- `src/status.ts` and `src/LiveStatus.tsx`: the status line for a shared project: "Live with Anna and Tom", "Reconnecting… Your changes are kept.", or nothing, so the app's own "Saved" shows.
- `src/codemirror.ts` (`@scholarkit/collab/codemirror`): other people's carets and selections in a code editor, with their names. Polemic's source editor and Cursive's Markdown view use it.
- `src/prosemirror.ts` (`@scholarkit/collab/prosemirror`): `mergeDoc` brings someone else's change into a rich-text editor as one change over the part that differs, so your place stays; `RemoteBlocks` marks the block each person is in. Polemic's Visual face uses both. Cursive's page editor has its own carets and merge in `packages/editor` (`editor/collab.ts`).
- `src/collab.css`: the styles. Import it in the app's CSS. It is plain CSS on the page's own tokens, so each app shows it in its own grays and in dark mode.

How presence travels (the awareness on the project's sync connection) stays with each app, as does what a position means in its editors.

The apps translate with the active language. Each app's `pnpm i18n` and catalog test read `node_modules/@scholarkit/collab/src` for the messages.

The package is MIT, as Polemic is, so Cursive and Binder (GPL-3.0) can use it too.
