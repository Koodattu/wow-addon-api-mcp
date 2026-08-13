# Publishing setup

The repository workflows handle refreshes and releases after a small one-time setup.

## 1. Protect `main`

Enable branch protection and require the `CI` checks before merge. Keep `.github/workflows/publish.yml` subject to code review because npm trusts that exact workflow.

## 2. Bootstrap the npm package

The unscoped npm name is `wow-addon-api-mcp`. A trusted publisher is configured from an existing package's settings, so bootstrap the first `0.1.0` release using one of these approaches:

1. Run `npm login`, then `npm publish --access public` from a clean, tested checkout; or
2. Add a short-lived granular npm automation token as the `NPM_TOKEN` repository secret and run the **Publish npm** workflow manually.

Remove `NPM_TOKEN` after trusted publishing works.

The initial push intentionally skips automatic publication while the package name does not yet exist. It still runs the full CI suite. After a manual bootstrap, run **Publish npm** once to create a matching GitHub release if needed.

## 3. Configure npm trusted publishing

In the package settings on npmjs.com, add a GitHub Actions trusted publisher with:

- Organization or user: `Koodattu`
- Repository: `wow-addon-api-mcp`
- Workflow filename: `publish.yml`
- Allowed action: `npm publish`

No environment is required by the checked-in workflow. npm requires GitHub-hosted runners, Node 22.14 or newer, npm 11.5.1 or newer, and `id-token: write`; the workflow uses Node 24, upgrades npm 11, and grants only the required permissions.

## 4. Enable refresh pull requests

In GitHub Actions settings, allow workflows to create and approve pull requests. The scheduled workflow uses `GITHUB_TOKEN` to maintain one `automation/wow-api-data` pull request. It does not auto-merge.

## Release flow

1. The refresh workflow checks Gethe's `live` branch every six hours.
2. A changed deterministic dataset is tested and submitted with a patch version bump.
3. A maintainer reviews and merges the pull request.
4. `publish.yml` re-tests the exact merge commit, publishes the new npm version, and creates the matching GitHub release.

A manual workflow run is safe: it skips npm publication if that exact version already exists and creates only a missing GitHub release.
