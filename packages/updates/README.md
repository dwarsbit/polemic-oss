# @scholarkit/updates

Updates for the apps. The browser builds say when a new version is served
([below](#a-new-version-in-the-browser)); the desktop apps update themselves.

Updates for the desktop apps: Polemic, Cursive and Binder. Each app checks
for a new version when it starts and once a day after that, downloads it in
the background and shows **Update ready**. It installs only when the person
chooses **Restart now**: the app saves the open project, installs the new
version and starts again. **Later** hides the card until the next start.
**Settings → Updates** turns the automatic check off and has **Check now**.

- `updates.ts`: the logic, with no Tauri or React, so the tests run it with fakes.
- `tauri.ts`: the logic on Tauri's updater and process plugins.
- `use-updates.ts`: the state for React, and the status line under the version.
- `components/UpdateCard.tsx`: the card at the bottom left of the window, and **What's new**.
- `components/UpdatesSettings.tsx`: the settings of Cursive and Binder. Polemic builds the same rows in its own settings layout.
- `notes.ts`: reads the release notes, the version's section of the changelog.

The package is MIT, as Polemic is, so Cursive and Binder (GPL-3.0) can use it too.

## How an update reaches the apps

1. The **Release** workflow of the app's public repository builds the
   installers. With `createUpdaterArtifacts` in `tauri.conf.json` it also
   builds the update files and signs them with the updater key. It adds
   them and a `latest.json` to the GitHub release; `latest.json` lists the
   download and signature for each platform, and the changelog section as
   notes.
2. The apps ask the Scholarkit server:
   `https://app.scholarkit.app/api/updates/<app>/<os>/<arch>/<installer>/<version>`.
   The server reads `latest.json` of the app's latest release and answers
   with the new version for that platform, or with nothing (204) when the
   app is up to date. Setting `UPDATES_PAUSED` there holds a release back.
3. Polemic also lists the `latest.json` of dwarsbit/polemic-oss itself, for
   when the server can't be reached.
4. The app downloads the file, checks its signature against the public key
   built into it, and installs it on **Restart now**. A file with another
   signature is refused, so a server or a GitHub account in the wrong hands
   can't push code to anyone.

Every installer type updates in place: the `.app` on macOS, the NSIS and MSI
installers on Windows, and the AppImage, `.deb` and `.rpm` on Linux. On
Windows the installer shows its progress and starts the app again. A `.deb`
or `.rpm` asks for the computer's password, as installing a package does.

## The updater key

Each app has its own key pair. The public key is in the app's
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`); the private key is a
secret of the app's public repository. Until both are set, the app's
**Release** workflow stops before it builds.

To make the key of an app:

1. In the app's folder, run `pnpm tauri signer generate -w ~/.tauri/<app>-updater.key`
   and choose a password. It writes the private key to that file and the
   public key to the same name with `.pub`.
2. In the app's public repository (dwarsbit/polemic-oss,
   dwarsbit/cursive-oss or dwarsbit/binder-oss), add two secrets under
   **Settings → Secrets and variables → Actions**:
   `TAURI_SIGNING_PRIVATE_KEY`, the content of the private key file, and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, its password.
3. Put the content of the `.pub` file in `plugins.updater.pubkey` of the
   app's `src-tauri/tauri.conf.json`, here in Scholarkit.

Keep the private key and its password somewhere safe, such as a password
manager. If they are lost, the installed apps can't take another update:
everyone has to download the next version by hand once, from a build with a
new key.

## Trying an update on your own computer

Build a version, build a newer one, and let the first update to the second
from a local folder:

1. Generate a key for testing (step 1 above) and export it:
   `export TAURI_SIGNING_PRIVATE_KEY=$(cat test.key) TAURI_SIGNING_PRIVATE_KEY_PASSWORD=…`.
2. Build the newer version with its public key and serve the folder with
   its update file and a `latest.json` (see Tauri's static JSON format),
   for example with `python3 -m http.server`.
3. Build the older version with the same public key and
   `--config '{"plugins":{"updater":{"endpoints":["http://localhost:8000/latest.json"],"dangerousInsecureTransportProtocol":true}}}'`,
   install it and open **Settings → Updates → Check now**.

## A new version in the browser

Polemic, Cursive and Binder in the browser, and the web home, show **A new
version is available** at the bottom left once a newer build is served, in
the look of **Update ready**. **Load new version** saves the open work first
and reloads only when it is saved (it gives up after 10 seconds and says so);
**Later** hides the card until yet another build comes. Nothing reloads by
itself.

- `vite.ts`: the plugin each app's `vite.config.ts` adds to its browser build
  (`--mode web`). It names the build after a hash of the built `index.html`,
  which lists every hashed script and style file, so the name changes only
  when that app's code changes. The name goes into the page as
  `<meta name="scholarkit-build">` and into `version.json` next to it. The
  app's Caddyfile serves that file with `Cache-Control: no-store`.
- `web/new-version.ts`: reads the page's build and asks for `version.json`
  every 15 minutes while the page is in view, and when it comes back into
  view or online.
- `web/NewVersionCard.tsx`: the card. The app passes what saves its open work.
- The web home has no Vite build: it names its build with the image's commit
  (`SENTRY_RELEASE`), served at `/version.json` by `apps/account`.

During a deploy the halves App A and App B are updated one after the other,
and the `sk_server` cookie keeps a browser on one half, so `version.json`
comes from the half that serves the page and the reload gets that version.
