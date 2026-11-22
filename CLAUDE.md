# Notes for agents

- Every piece of user-facing text (interface strings, errors, docs, README, changelog) follows [CONTENT.md](CONTENT.md).
- Every change, feature or bug fix adds its line to the `## X.Y.Z (unreleased)` section at the top of [CHANGELOG.md](CHANGELOG.md), in the same pull request. Start that section with the next version if there is none: a minor bump for new features, a patch bump for fixes only. Changes the reader doesn't see (CI, refactors, tests) get no line.
- Releases are cut from that section by the Polemic release workflow in Scholarkit; see [docs/releasing.md](docs/releasing.md).
- Polemic is developed in the Scholarkit monorepo, in `apps/polemic`, and mirrored to the public `dwarsbit/polemic-oss` repository (MIT) on every change. Change it in Scholarkit: the next mirror overwrites changes made in polemic-oss. Keep it buildable on its own there: it may use the workspace's shared packages, nothing from other apps.
- The workflows in `.github/` run in polemic-oss, not in Scholarkit: desktop CI, the smoke test, the corpus test and the release builds.
