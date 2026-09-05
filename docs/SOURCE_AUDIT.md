# Supplementary source audit

Audited September 5, 2026, against Gethe retail build 12.1.0.69587, commit `8ea15b61e45c0ed4eba01439c90757f86eb78d34`, and Ketho/BlizzardInterfaceResources live commit `36dd01db2d8fa5086dffda5cbfb3d55f4a70e526`.

This section records the initial 0.2.0 audit. Version 0.3.0 backfills resources for all 26 snapshots, explicitly marks 11 historical snapshots partial, adds four separately licensed engine contracts and UnitAura guidance, and supplies an optional local runtime collector. See [validation and remaining limits](VALIDATION.md). The initial gaps described below are retained as audit history, not a statement of current tool coverage.

## Source roles

[BlizzardInterfaceResources](https://github.com/Ketho/BlizzardInterfaceResources) complements the generated Blizzard API documentation. Its runtime global inventory identifies gaps such as CreateFrame and hooksecurefunc; its templates, mixins, frames, CVars, atlas metadata, and localized strings support UI development. Its event-name inventory matched all 1,782 events already bundled at audit time. Widget and ScriptObject inventories substantially overlap the documented widget catalog and are best used as coverage checks rather than replacements for signatures or restrictions.

The repository's README identifies several provenance classes: KethoDoc runtime dumps, FrameXML parsing, and GlobalStrings/AtlasInfo downloaded from wago.tools. A dump's branch/build must be preserved independently; missing names do not establish removal, and runtime observation does not establish an addon-safe contract. Classic and PTR branches must not be blended into retail.

No explicit license file was present in the audited BlizzardInterfaceResources tree. This release therefore does not redistribute its files. Its data remains a useful external audit reference. Redistribution terms for it and its constituent sources need clarification before introducing a bundled runtime or asset dump.

## Implemented coverage

The supplementary catalog is generated directly from the same pinned Gethe source as the API contracts. It selects mainline/default addon TOCs, follows Lua/XML includes, expands `[Family]` to Mainline and `[Game]` to Standard, and filters explicit client-game and glue-only conditions. It includes load-on-demand addon source; it does not simulate which addons or environments are loaded in a running client. Unresolved includes, ambiguous include paths, and parser errors stop generation rather than silently dropping resources.

- XML templates include element type, inheritance, mixins, raw attributes, and child-name pattern metadata.
- Lua mixins expose source declarations, composition parents, and parameter names on method definitions.
- Symbols include global identifiers, qualified function/method definitions, and call-site references. These are separate from authoritative API contracts.
- Named UI objects include XML declarations and CreateFrame calls with literal names. Dynamically constructed Lua names are not inferred.
- CVars and atlases include literal usages in selected Lua/XML source. They are not complete registries and do not supply defaults or texture dimensions.

Results include the selected client build, repository commit, file, line, and addon. Source references cannot determine function signatures, return values, restrictions, or runtime availability. Original Blizzard security metadata remains in the API catalog and is not overwritten by resource data.

Only the current 12.1.0 snapshot is initially backfilled. An old snapshot without resource coverage returns an explicit unknown-coverage result. The API migration tools continue to compare documented contracts and do not infer API additions/removals from the supplemental index. Exact API identities take precedence over short names; fallback name matches are labeled, and migration comparisons do not substitute a namespaced API for a missing global.

## Remaining source limitations

- Engine signatures absent from generated Blizzard documentation still require another clearly licensed, versioned documentation source. A source reference to CreateFrame supplies evidence of use, not its complete contract.
- issecurevariable was present in Ketho's inventory but was not referenced in the selected current retail source. It is not synthesized into the catalog.
- Complete runtime CVar defaults/flags, atlas dimensions, and localized GlobalStrings are not bundled. These depend on the separate data/provenance review above.
- The catalog represents source declarations and references. Conditional Lua execution, secure environments, and load-on-demand behavior still require inspection of the linked source and the documented restrictions.

## Release recovery

The 0.1.1 refresh fix replaces stale current-build assertions with manifest checks while preserving fixed historical migration fixtures. It also tests build replacement and a new patch family, retains all existing historical patches, and preserves Git ancestry during local updates.

The npm publisher's owner must match GitHub's capitalization exactly: `Koodattu`, not `koodattu`. The corrected trusted publisher successfully published 0.1.1 with provenance. See [publishing setup](PUBLISHING.md) for release configuration.
