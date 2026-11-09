# Changesets

This repository uses [changesets](https://github.com/changesets/changesets) to version and publish `trod` (the
`plugin/` package).

- In a pull request that changes what users get (the server, the CLI, the skills, the plugin manifests), run
  `pnpm changeset`, pick a bump and describe the change for the changelog.
- When changesets land on `main`, the Release workflow opens a "Version packages" pull request. It bumps
  `plugin/package.json`, copies the version into the plugin manifests, `server.json` and the server
  (`scripts/sync-version.mjs`), rebuilds the bundles and writes `plugin/CHANGELOG.md`.
- Merging that pull request stages the new version on npm, with provenance, tags it `v<version>` and creates the
  GitHub release. A maintainer approves the staged version with 2FA, under Staged Packages on npmjs.com or with
  `npm stage approve <stage-id>` (the job summary lists the ID). Within a few hours of the approval the MCP Registry
  workflow lists the version there.

## Before the first release

`plugin/package.json` sits at `0.0.0`, which is never published: the `minor` in `initial-release.md` takes it to
`0.1.0`. Once that release is out, every version is computed from the last one.

## What the release needs (repository owner, once)

- On npmjs.com, the `trod` package lists `swissspidy/trod` and `.github/workflows/release.yml` as its trusted
  publisher, allowing staged publishes only. No token is stored. A trusted publisher configuration expires if it
  is not used within 48 hours, so run the first release within that window.
- Settings → Actions → General: "Allow GitHub Actions to create and approve pull requests", so the workflow can
  open the "Version packages" pull request.
- The MCP Registry needs nothing: it authenticates the workflow through GitHub OIDC.

The "Version packages" pull request is opened with the workflow's own token, which starts no workflows, so CI does
not run on it; the release's `pack` job runs the same checks before anything is published.

## How the release workflow runs

1. `version` runs on every push to `main`. Changesets opens or updates the "Version packages" pull request; it
   installs with `--ignore-scripts` and has no OIDC token. When `plugin/package.json` holds a version npm does not
   have yet (that pull request was merged), the push is a release.
2. `pack` installs, runs the checks, makes sure the committed bundles match the sources, runs publint and packs
   `plugin/`. It has no OIDC token.
3. `publish` is the only job with `id-token: write`, and it installs and runs nothing from the dependency tree: it
   stages the tarball with `npm stage publish` (npm 11.15.0 or later), then tags `v<version>` and creates the
   GitHub release from `plugin/CHANGELOG.md`. A version already on npm and an existing tag are skipped, so a run
   that failed partway can be re-run; approve or reject what a failed run staged first.

`mcp-registry.yml` runs every six hours (and by hand): when npm has a version of `trod` that the MCP Registry
lacks, it publishes `plugin/server.json` there.
