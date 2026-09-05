# Local runtime snapshot

This optional retail addon exports explicitly requested observations for local MCP use. It does not provide a complete inventory or test whether an API is safe in combat. No captured data is sent to a server.

1. Copy this entire `WowApiSnapshot` directory from the repository or installed npm package into your retail client's `Interface/AddOns/` directory.
2. Edit `Request.lua` before loading it. Each category accepts at most 2,000 unique names. Use explicit CVar names, atlas names, dotted symbol names, or uppercase global string keys. Leave `globalStrings` empty unless you need selected localized text. Do not request globals belonging to other addons or containing personal information.
3. Enable the addon, log in, and run `/wowapisnapshot`. Select the export text, copy it, and save it as a UTF-8 `.json` file on your computer. Reload the UI after changing the request.
4. Start the MCP server with `--runtime-data /absolute/path/snapshot.json`, or set `WOW_API_RUNTIME_DATA` to the file path. Restart the server when replacing the file.
5. Call `lookup_runtime_resource` with `name`, `kind` (`cvar`, `atlas`, `symbol`, or `globalstring`), and a catalog `version` matching the captured build. Supply `locale`, for example `enUS`, to require that locale. If omitted, the snapshot's locale is returned without filtering.

The default request collects one CVar, one atlas, four engine symbol types, and no localized text. CVar records contain defaults and flags, never current user settings. Atlas records contain numeric geometry, not images. Symbol records contain types, not values or signatures. Localized text retains Unicode and formatting placeholders.

The schema records build, retail project, interface version, locale, UTC capture time, and collector version. Every requested name is classified exactly once as a record, missing, or failed. Missing means the query returned no usable value in that session; failed means it raised an error. Neither proves permanent removal. Unrequested names remain unknown. JSON exports and imports are limited to 10 MiB. The importer does not execute Lua and rejects unknown fields, duplicates, unrequested records, and incomplete classifications.

The collector is authored under the project's Apache-2.0 code license. That license does not grant rights in Blizzard text or other captured content. Keep snapshots local unless you have established the relevant redistribution rights. Review requested keys and exported content before sharing them with an AI service.

The collector core has automated tests in a Lua interpreter with mocked WoW APIs. The export window and actual client API behavior have not yet been validated inside WoW. See [the repository validation guide](https://github.com/Koodattu/wow-addon-api-mcp/blob/main/docs/VALIDATION.md) for the manual checks.
