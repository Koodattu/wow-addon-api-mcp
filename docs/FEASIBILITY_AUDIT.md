# Remaining coverage and feasibility audit

Implementation follow-through in 0.3.0: all 26 historical resource archives are now included (11 explicitly partial), four reviewed engine contracts and UnitAura migration guidance are separately attributed, and a local runtime collector/importer covers explicitly requested observations. Historical parser failures identified below were addressed. The findings below describe the pre-implementation investigation; rights uncertainty and the need for in-client validation remain. See [validation scope](VALIDATION.md).

Investigated September 5, 2026 against package 0.2.0, project commit `3deb51c52d1c8daf31b2a6e5b696f7c9dd12efd4`, Gethe retail commit `8ea15b61e45c0ed4eba01439c90757f86eb78d34` (12.1.0.69587), and Ketho resource commit `36dd01db2d8fa5086dffda5cbfb3d55f4a70e526`. This is a feasibility assessment, with isolated extraction and lookup experiments. It does not add or publish these data sources.

The current release is operational, but the broader goal of reliably supporting new and legacy addons is not finished. A curated engine-contract layer and a practical evaluation suite are worthwhile next steps. Historical resource extraction has concrete compatibility failures. Bulk redistribution of the remaining upstream data does not have a verified blanket permission.

## What the remaining Ketho data provides

The [pinned README](https://github.com/Ketho/BlizzardInterfaceResources/blob/36dd01db2d8fa5086dffda5cbfb3d55f4a70e526/README.md) distinguishes KethoDoc runtime dumps, FrameXML parsing, and Wago-derived data. These are different evidence classes and should not share an undifferentiated provenance or availability claim.

| Resource | Observed pinned coverage | Practical value | Limits and feasibility |
| --- | --- | --- | --- |
| [GlobalAPI](https://github.com/Ketho/BlizzardInterfaceResources/blob/36dd01db2d8fa5086dffda5cbfb3d55f4a70e526/Resources/GlobalAPI.lua) | 6,682 WoW names and 150 Lua names | Identify functions absent from generated API documentation, and distinguish observed runtime names from source references | Straightforward inventory importer; no signatures, return values, restrictions, or guaranteed availability across builds/environments. Count includes qualified names, not just top-level functions. |
| [CVars](https://github.com/Ketho/BlizzardInterfaceResources/blob/36dd01db2d8fa5086dffda5cbfb3d55f4a70e526/Resources/CVars.lua) | 1,652 retail variables and 77 commands; separate PTR tables contain 10 variables and 10 commands | Defaults, categories, account/character flags, secure flags, help text | Material improvement over our 277 source-referenced CVar names. Preserve variables versus commands and retail versus PTR. A stored default or flag is not a guarantee that an addon can change it in every context. Help prose has different reuse implications from a name or numeric flag. |
| [AtlasInfo](https://github.com/Ketho/BlizzardInterfaceResources/blob/36dd01db2d8fa5086dffda5cbfb3d55f4a70e526/Resources/AtlasInfo.lua) | 2,523 roots and 17,471 members | Member dimensions, UV coordinates, tiling | Much richer than our 3,193 referenced names. Counts are not directly equivalent: roots, members, and usages differ. Numeric metadata does not include texture image assets, and should not be represented as permission to distribute those assets. |
| [GlobalStrings](https://github.com/Ketho/BlizzardInterfaceResources/tree/36dd01db2d8fa5086dffda5cbfb3d55f4a70e526/Resources/GlobalStrings) | 11 locales, each with 23,780 assignments | Find existing localized UI text and formatting placeholders | Useful, but lower priority than callable contracts. Values are Blizzard UI text/translations. Locale, placeholders, build, and fallback behavior matter; do not normalize away formatting tokens. Key lookup without values is a smaller distinct feature. |

The event-name inventory already overlapped the 1,782 events in the earlier audit. Templates and mixins now have substantial source-derived coverage. Adding every file indiscriminately would increase volume without necessarily improving addon correctness.

## Permissions: what is established and what is not

No explicit license or redistribution statement was found in the pinned BlizzardInterfaceResources tree, README, or its available issue/PR history. GitHub reports `license: null`. Public visibility is not an open-source license: [GitHub's guidance](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository) distinguishes viewing/forking from broader reuse permissions.

This is not a claim that every identifier or number is copyrightable. The [U.S. Copyright Office](https://copyright.gov/help/faq/faq-protect.html) distinguishes facts and names from their expression. However, that distinction does not establish a blanket right to republish a mixed collection of code, prose, translations, and extracted records in every jurisdiction. The practical decision should be made per data class, not solely from the presence or absence of a LICENSE file.

The same uncertainty applies to our existing upstream mirror. [Gethe/wow-ui-source](https://github.com/Gethe/wow-ui-source) also has no explicit repository license and identifies itself as a mirror. Deriving data directly from Gethe establishes a traceable source and avoids copying Ketho's implementation; it does not itself establish a Blizzard redistribution grant. Our existing third-party attribution is not a substitute for such permission. This corrects the implication that the previous source choice fully resolved rights questions; it is not a finding that the existing release is conclusively unlawful.

[KethoDoc](https://github.com/ketho-wow/KethoDoc/blob/master/LICENSE), [WowDoc](https://github.com/Ketho/WowDoc/blob/master/LICENSE), and [wowless](https://github.com/wowless/wowless/blob/main/LICENSE) have MIT-licensed tool code. A tool's license does not automatically establish the rights in its extracted inputs or outputs. Ketho's VS Code extension also explicitly distinguishes generated Blizzard documentation from Warcraft Wiki documentation. Its top-level MIT label should not erase the provenance of copied community text.

The Wago data endpoints are accessible, but no public Wago.Tools terms granting reuse of these DB2-derived datasets were located. This search result is uncertainty, not proof that no terms exist. Terms for the separate Wago addon service are not a substitute. Blizzard's [Developer API Terms](https://www.blizzard.com/en-us/legal/a2989b50-5f16-43b1-abec-2ae17cc09dd6/blizzard-developer-api-terms-of-use) concern authorized API applications; its [UI Add-On Policy](https://us.forums.blizzard.com/en/wow/t/ui-add-on-development-policy/24534/1) concerns addons. Neither was found to grant blanket redistribution of these repositories' extracted resources. Their existence also does not prove that every provision directly governs every factual record here.

A useful positive route exists: [Warcraft Wiki's copyright policy](https://warcraft.wiki.gg/wiki/Warcraft_Wiki%3ACopyrights) licenses content it may lawfully license under CC BY-SA 4.0. [CC BY-SA](https://creativecommons.org/licenses/by-sa/4.0/) permits sharing and adaptation with attribution, a license link, change notices, and share-alike for adaptations. A separately attributed documentation dataset can follow those terms without simply relabeling copied text as Apache-2.0. Blizzard-origin material still needs its own provenance assessment. Brief paraphrasing alone does not automatically remove obligations for an adaptation.

Practical choices are therefore: use explicitly licensed community documentation with its notices; independently author narrowly factual records with cited evidence and a documented reuse rationale; seek clarification for copied upstream datasets; or retain uncertain material as linked external evidence. A permission from Ketho would cover only rights Ketho can grant. No requests to maintainers were sent during this audit.

## Engine contracts: achievable scope

Exact current function lookups for `CreateFrame`, `hooksecurefunc`, and `issecurevariable` return no entries. Supplementary symbol lookups return 170, 6, and 0 source records respectively. References do not answer the most important contract questions.

The pinned wiki pages provide concrete documentation for [CreateFrame](https://warcraft.wiki.gg/wiki/API:CreateFrame?oldid=6818673), [hooksecurefunc](https://warcraft.wiki.gg/wiki/API:hooksecurefunc?oldid=6842318), [issecurevariable](https://warcraft.wiki.gg/wiki/API:issecurevariable?oldid=6842324), and [issecure](https://warcraft.wiki.gg/wiki/API:issecure?oldid=6842321). They support a useful first curated set. No inspected source establishes complete, tested contracts for every engine name in every historical patch.

wowless adds [CreateFrame tests](https://github.com/wowless/wowless/blob/main/data/test/CreateFrame.lua), [hook tests](https://github.com/wowless/wowless/blob/main/data/test/hooksecurefunc.lua), and [taint-variable tests](https://github.com/wowless/wowless/blob/main/data/test/issecurevariable.lua). These can inform independently written validation cases. It is an emulator whose README warns of incomplete behavior, not an authoritative substitute for WoW. Its CreateFrame YAML uses a broader name type than the wiki, while some other engine APIs have implementation references without full argument/return schemas. These differences require reconciliation rather than majority voting.

A suitable first implementation would attach provenance, source revision, supported client/build, contract completeness, types/optionality/returns, overloads, behavior notes, and restrictions to each curated entry. Keep it distinct from generated Blizzard contracts and expose that distinction in lookup results. Canonical entries should win on overlap. A current community contract must not be copied backward into historical snapshots or used to infer introduction/removal dates. Wiki revision time is not equivalent to the game build the text describes.

## Historical extraction: measured results

Three exact upstream archives were downloaded into an isolated cache. The production dataset and extractor were not changed. Extraction was called with the source metadata from each existing bundled snapshot.

| Snapshot | Current extractor result | Resource inventory when successful |
| --- | --- | --- |
| 10.0.0.46549, `28ab53f48c691a976daa33acb509e96d9b850503` | Failed on an escaped pipe in EncounterJournal Lua | No publishable inventory produced |
| 11.0.0.55960, `742bf9604e0009bebb9a61a4f953d2661f8b387e` | Succeeded; API content unchanged | 1,636 files; 2,642 templates; 2,104 mixin names; about 1.41 MB compressed resources |
| 12.0.7.68974, `c878310d8432a65bac029c7bacc24eeb2e662bbe` | Succeeded; API content unchanged | 2,439 files; 3,460 templates; 3,110 mixin names; about 2.01 MB compressed resources |

The 10.0.0 [EncounterJournal source](https://github.com/Gethe/wow-ui-source/blob/28ab53f48c691a976daa33acb509e96d9b850503/Interface/AddOns/Blizzard_EncounterJournal/Blizzard_EncounterJournal.lua#L680) combines syntax not handled by a single current luaparse mode: 5.2 rejects the escape at line 680; 5.1 rejects a statement at line 767. Trying 5.2 then 5.1 does not solve this file. An isolated prototype allowing the older escapes passed that obstacle, then failed on `Blizzard_SettingsInbound.lua`, referenced by [Settings.xml](https://github.com/Gethe/wow-ui-source/blob/28ab53f48c691a976daa33acb509e96d9b850503/Interface/SharedXML/Settings/Settings.xml) but absent from the downloaded snapshot. Older GlueXML TOCs also need explicit client-context selection; they cannot rely solely on modern addon headers.

This exposes a maintenance regression: the new mandatory resource pass blocks rebuilding the oldest existing API snapshot through the all-history builder. The already bundled historical API files remain usable, and the current refresh pipeline passes. Restore independent API-only history rebuilding before expanding resource backfills. Explicitly requested resource extraction must still fail or report explicit partial coverage with diagnostics; silently dropping missing files would create misleading data.

All 26 snapshots were not tested, so the two successful samples do not establish full-range support. Backfilling also has storage and memory costs: the current resource JSON alone is 38,321,199 bytes before compression and object allocation. Adding similar payloads to every API archive would make API-history queries parse unnecessary resource data. Separate resource files, loaded when requested, are preferable for a full backfill. The existing version catalog/cache can be reused.

## Real-addon capability evaluation

The probe used [WeakAuras commit `cc68817a6d9827e44f60171231057c12139cddd9`](https://github.com/WeakAuras/WeakAuras2/tree/cc68817a6d9827e44f60171231057c12139cddd9) as a concrete source of development and migration tasks. Its code is evidence of a task, not proof that a pattern is appropriate for every supported client.

| Task drawn from real source | Current outcome |
| --- | --- |
| Explain frame creation in [Icon.lua:276](https://github.com/WeakAuras/WeakAuras2/blob/cc68817a6d9827e44f60171231057c12139cddd9/WeakAuras/RegionTypes/Icon.lua#L276) | CreateFrame contract missing; CooldownFrameTemplate declaration and Cooldown:SetDrawBling contract available. Partial support. |
| Explain the legacy UnitAura adapter in [AuraEnvironment.lua:14](https://github.com/WeakAuras/WeakAuras2/blob/cc68817a6d9827e44f60171231057c12139cddd9/WeakAuras/AuraEnvironment.lua#L14) | UnitAura has no exact entry in either tested endpoint, so compare_api cannot explain this migration. Current C_UnitAuras.GetAuraDataByIndex has arguments, nullable AuraData return, and secret/aura-access restrictions. |
| Find the same template in the released 11.0.0 snapshot | Correctly reports uncollected supplementary coverage. The isolated rebuild demonstrates that at least this version can supply it. |
| Look up nameplateShowEnemies defaults | Three CVar references, no default/flag/help record. |
| Look up _AdventuresFrame-Small-Top dimensions | Source references, no stored atlas geometry. |
| Retrieve BINDING_HEADER_ACTIONBAR in a chosen locale | Symbol reference only; no localized-value catalog. |

These are deterministic capability probes, not an LLM success-rate benchmark and not tests executed inside WoW. They establish useful gaps without claiming that generated addons work in game.

A repeatable evaluation suite can be built now: pin addon source and target versions, specify expected contracts/evidence/unknowns, and cover frame creation, inherited methods/templates, removed globals and replacements, aura restrictions, secure action behavior, CVars, and localization. Score correct version selection, explicit uncertainty, valid citations, and absence of invented contracts separately from whether the generated addon runs. Maintain independent expected results rather than deriving the answers from the same dataset being tested. Then evaluate agent outputs, including comparisons with and without this MCP.

Real-client validation is a separate acceptance step: loading, combat lockdown, taint, secret values, and locale-dependent behavior require execution in the specified WoW client. No such execution was performed. Static checks and wowless can supplement, but cannot certify, those behaviors.

## Recommended sequence

1. Restore API-only historical rebuilding and add regression coverage for the dialect/missing-include cases. Keep partial resource coverage explicit.
2. Add a small, separately sourced and licensed engine-contract layer, starting with frame creation and secure/taint helpers. Build the real-addon evaluation fixtures alongside it.
3. Backfill supplementary resources into separate files after checking each pinned version. Preserve existing API snapshots and distinguish declaration presence from runtime availability.
4. Resolve a documented reuse route for runtime inventories, CVar metadata, and atlas geometry. A build-tagged collector or importer can be implemented now; a collector still needs actual runtime input and does not itself solve distribution rights.
5. Add localized text only after its reuse basis, locale schema, placeholders, and package-size strategy are established. It is useful but not the first correctness bottleneck.

Both broad directions can advance immediately. A claim that all remaining data can be bundled safely, every historical build can be regenerated, or complete addon correctness can be validated in this session would exceed the evidence.
