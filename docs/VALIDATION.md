# Validation scope for 0.3.0

## Automated evidence

- The test suite exercises MCP stdio queries, exact-name precedence, security metadata, migration comparisons, source extraction, curated provenance/build gates, and optional runtime data validation.
- All 26 resource archives are checked against manifest provenance, actual record counts, and coverage diagnostics. Eleven snapshots from 10.0.0 through 10.2.7 are explicitly partial; 15 from 11.0.0 onward have complete selected-source coverage. Missing/ambiguous includes remain visible instead of being guessed or silently ignored.
- During backfill, API output from every pinned checkout was compared with the retained serialized API data. No historical API content changed. Resources moved into separate compressed archives and separate bounded caches.
- CI tests Node 20, 22, and 24. Node 24 also rebuilds the current source deterministically and rebuilds both API-only and partial resources for the oldest pinned source. Intermediate source extraction is covered by the release backfill and archive validation, not 26 upstream checkouts on every CI run.
- The real-addon scenarios in `test/fixtures/addon-scenarios.json` cite pinned WeakAuras source locations and exercise four tool calls covering frame construction/templates and legacy aura migration. They are focused retrieval regressions, not an end-to-end benchmark of an AI successfully modifying and running an addon.
- Fengari executes the actual collector core with mocked WoW APIs. Tests cover omitted current CVar values, nil versus query failures, explicit requests, Unicode/placeholder preservation, and importer rejection. Fengari's Lua 5.3 environment is not WoW's runtime.

## Manual client checks still needed

Use a retail client matching a bundled full build, outside combat, with the collector enabled. Run `/wowapisnapshot`, copy and parse its JSON, and verify build, interface version, locale, and capture time. Compare the requested CVar default and flags with direct `C_CVar.GetCVarInfo` results while confirming the current setting is absent. Compare atlas geometry with `C_Texture.GetAtlasInfo`. Verify an existing and an unknown symbol, and an explicitly requested localized key with placeholders. Restart the MCP server with that file and check matching/mismatching versions and locales. Repeat in another locale if localized output is required.

The export window, selection/copy behavior, client-specific restrictions, and secret-value behavior need these real-client checks. There is no automated claim of passing them. Core engine contracts are documentation-reviewed for 12.1.0.69587, not combat/taint-certified. A future in-client harness should test secure/insecure execution and hook behavior without extrapolating from a mocked Lua environment.

## Coverage and rights limits

Four curated engine APIs and one migration record do not complete the undocumented engine API surface. In particular, `securecall` remains outside this layer pending better behavioral validation. Historical engine contracts are not inferred from current documentation. Runtime collection is an explicit-name local facility, not a bundled complete Ketho inventory. Bulk Ketho/Wago data and localized dumps remain excluded because no blanket redistribution grant was verified. See [the feasibility audit](FEASIBILITY_AUDIT.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).
