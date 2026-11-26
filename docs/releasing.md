# Releasing

Polemic is developed in the Scholarkit repository (`apps/polemic`) and
mirrored to dwarsbit/polemic-oss, where the installers are built and
published. A release takes two workflows:

- **Polemic release** in Scholarkit
  (`.github/workflows/polemic-release.yml` at its root) sets the version,
  commits it and mirrors the commit to polemic-oss with the tag `vX.Y.Z`.
- **Release** in polemic-oss (`.github/workflows/release.yml` here) runs
  on that tag, started by the mirror: it builds the installers and
  publishes the GitHub release.

It releases the version of the `## X.Y.Z (unreleased)` heading in
[CHANGELOG.md](../CHANGELOG.md).

1. Keep the next version's changes under a `## X.Y.Z (unreleased)` heading
   at the top of the changelog. Every pull request that changes, adds or
   fixes something adds its line there; start the heading if there is
   none yet.
2. Run **CI** on Scholarkit's `main` from the Actions tab: it runs only
   by hand. Once it is green, and CI on polemic-oss's `main` is green
   for the same files (the Mirror workflow starts it after a merge), run
   **Polemic release** from the Actions tab of Scholarkit, on `main`. It
   takes no input.

**Polemic release** requires exactly one unreleased heading and a numeric
version (Windows installers take no pre-releases). It sets the version in
`package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`, dates
the changelog heading, commits "Release Polemic vX.Y.Z" to Scholarkit's
`main` with the tag `polemic-vX.Y.Z`, and mirrors it. If the mirror
fails, it deletes the tag and reverts the commit, so the changelog
heading is unreleased again: fix the cause and run it again.

**Release** then builds for macOS (Apple Silicon and Intel), Linux and
Windows and attaches the installers to a draft GitHub release, with the
changelog section as notes. Once every build has succeeded, it publishes
the release as the latest one. If a build fails, the draft and the tag
stay: re-run the failed jobs. A fix that needs a code change goes out as
the next version.

Each build also makes the files the installed apps update from, signed
with the updater key, and the release gets a `latest.json` that lists
them. The Scholarkit server reads that file to tell the apps about the
new version. **Release** stops at the start when the updater key is
missing: the `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets in polemic-oss, and the public
key in `src-tauri/tauri.conf.json`. See
[the updates package](../packages/updates/README.md).

macOS and Windows builds are signed once the signing secrets are set in
polemic-oss; see [Code signing](signing.md) for the setup.

The builds report errors to Sentry once the `SENTRY_DSN` variable is set in
polemic-oss, and send their source maps there once the `SENTRY_AUTH_TOKEN`
secret and the `SENTRY_ORG` and `SENTRY_PROJECT` variables are set too.
Without them a release sends no reports; builds from a fork never do.
