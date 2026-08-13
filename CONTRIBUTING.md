# Contributing

## Development setup

Use Node.js 20 or newer:

```shell
npm ci
npm run data:update
npm test
npm run pack:check
```

Generated snapshots and `data/manifest.json` are committed intentionally. Do not hand-edit them; change the extractor or its inputs and rebuild.

## Dataset changes

`npm run data:update` refreshes only the current retail patch from Gethe's `live` branch. When Blizzard starts a new patch family, the build adds a new `data/retail/<patch>.json.gz` entry and makes it the manifest default. A later build in that patch replaces the same canonical snapshot.

`npm run data:history` rebuilds every retained patch from the upstream Git history. Use `--from` and `--to` with `scripts/build-history.mjs` to limit the range during development. The command requires the official Gethe repository at `.cache/wow-ui-source` and temporarily checks out historical commits under `.cache/`.

Keep transformations lossless unless a field is only structural. New Blizzard metadata should remain visible in the normalized entry's `metadata`, argument, return, payload, or field object. Add a focused regression test when an upstream schema change requires parser work.

Extraction must remain deterministic. It may use pinned upstream commit metadata, but must not put the current clock time or local paths into a dataset. Historical snapshots must never be combined into one store; version selection happens before a query is executed.

## Pull requests

- Keep changes narrowly scoped.
- Include generated snapshots only when extraction output changes.
- Run `npm test` and `npm run pack:check`.
- Do not weaken freshness or security-metadata assertions to accept incomplete output.
