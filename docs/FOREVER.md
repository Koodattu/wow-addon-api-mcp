# Forever beta support

Audited September 18, 2026, against Gethe's mirror of Blizzard source for Forever beta `1.60.1.69913`, commit [`70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e`](https://github.com/Gethe/wow-ui-source/tree/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e). This records the initial supported beta; consult `--channel forever --dataset-info` for the installed snapshot.

## Channel boundaries

By default one server exposes both the Retail manifest and `data/forever/manifest.json`. Single-build tools require `channel` and `version`. Each channel has its own latest version, history, API archives, and resource archives. Unsupported channels and versions fail explicitly. A build cannot insert a Forever snapshot into a Retail manifest or vice versa. Archive formats remain unchanged.

Use one MCP server for both games. Every build-specific result identifies its channel, patch, full client version, build, and source commit. Comparisons require explicit source and target channel/version pairs and may cross channels; their added/removed labels describe catalog presence, not chronological game changes. History stays within one explicit channel. `--channel retail` or `--channel forever` restricts the server to one game as a compatibility mode, allowing existing calls to omit channel/version and use that game's latest snapshot.

## Source extraction

The generated documentation parser handles the beta's table syntax without a new parser. The initial snapshot contains 638 systems, 5,100 functions, 1,487 methods, 1,802 events, 887 enumerations, 851 structures, and 93 widgets. Secret-value and restricted-API fields are preserved. Forever builds must retain security metadata even though their major version is 1.

The beta source uses Mainline as its family and Camelot as its game. For example, [FriendsFrame's TOC](https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_FriendsFrame/Blizzard_FriendsFrame.toc) selects Camelot files instead of their Mainline variants for that game. The extractor follows these family/game substitutions and allow/exclude conditions in TOCs and XML. It does not simulate Lua execution or prove that every documented API is usable in the client.

The initial resource archive is explicitly partial. [Camelot/EquipmentFlyout.xml](https://github.com/Gethe/wow-ui-source/blob/70ef1b2fd78061a73f886c4a1e79dc5b5cff6d5e/Interface/AddOns/Blizzard_FrameXML/Camelot/EquipmentFlyout.xml) references `EquipmentFlyout.lua`, which exists at both sibling and addon-root paths. The extractor records that unresolved include without choosing a candidate. The Camelot Lua file is also explicitly included by its TOC and is collected through that path. Strict extraction still rejects the ambiguity; beta refreshes explicitly opt into partial resource coverage. Regression checks reject additional coverage gaps until reviewed.

## Runtime observations and curated contracts

The collector supports Retail and the reviewed Forever `1.60.x` version family, records a separate channel, and declares both interface versions in its TOC. Repeat `--runtime-data` to load observations for both games in one process. Runtime queries require a matching channel and exact client version; specify locale when multiple locales match. Duplicate channel/build/locale imports are rejected. The client project identifier alone is insufficient to distinguish these Mainline-family clients.

Collector tests use mocked game APIs. Loading the addon, its export window, actual project identification, and observations in and out of combat still require beta-client validation. This release does not claim in-client testing. Curated engine contracts remain tied to their reviewed Retail build; no Forever applicability is inferred.

## Maintenance

Refresh with `npm run data:update -- --channel forever --allow-partial-resources`. The scheduled workflow refreshes Retail from `live` and Forever from `forever` in separate caches. CI rebuilds both pinned datasets and checks for archive drift. Historical builds also accept `--channel forever` and filter out other version families from upstream history.

For a new beta version family, review client identification, interface metadata, family/game selection, restrictions, and source coverage before extending support. Do not infer compatibility from the version number alone.
