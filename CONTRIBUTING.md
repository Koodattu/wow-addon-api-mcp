# Contributing

## Development setup

Use Node.js 20 or newer:

```shell
npm ci
npm run data:update
npm test
npm run pack:check
```

The generated dataset is committed intentionally. Do not hand-edit `data/mainline.json.gz`; change the extractor or its inputs and rebuild it.

## Dataset changes

Keep transformations lossless unless a field is only structural. New Blizzard metadata should remain visible in the normalized entry's `metadata`, argument, return, payload, or field object. Add a focused regression test when an upstream schema change requires parser work.

The extraction command must remain deterministic. It may use the pinned upstream commit metadata, but must not put the current clock time or local paths into the dataset.

## Pull requests

- Keep changes narrowly scoped.
- Include the generated dataset only when the extraction result changes.
- Run `npm test` and `npm run pack:check`.
- Do not weaken freshness or security-metadata assertions to accept incomplete output.
