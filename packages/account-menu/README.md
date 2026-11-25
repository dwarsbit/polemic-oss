# @scholarkit/account-menu

The account menu of every app: Polemic, Cursive, Binder and the Scholarkit home page. The avatar at the end of the header opens who is signed in, the plan, the storage and cloud compile used today, the active review links, **Upgrade to Plus** or **Upgrade to Pro**, **Manage account** and **Sign out**. In the Cursive and Binder desktop apps it also says whether the open project syncs with the account.

- `src/AccountMenu.tsx`: the menu, `Avatar` and `UsageMeters`.
- `src/format.ts`: plan names, storage sizes, initials and the plan to upgrade to.
- `src/account-menu.css`: the styles. Import it in the app's CSS. It is plain CSS on the page's own tokens (`--popover`, `--muted`, `--accent`, `--border`, `--primary-fill` or `--primary`, `--warning`), so each app shows the menu in its own color and in dark mode.

The numbers come from `GET /api/usage`, which the app fetches each time the menu opens (`loadUsage`). Without them the menu still works, with the plan from `GET /api/me`.

The apps translate with the active language. A page that translates per request, as the home page does, passes its `translator`. Each app's `pnpm i18n` and catalog test read `node_modules/@scholarkit/account-menu/src` for the messages.

The package is MIT, as Polemic is, so Cursive and Binder (GPL-3.0) can use it too.
