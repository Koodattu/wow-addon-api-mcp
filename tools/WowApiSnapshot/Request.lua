local _, addon = ...
-- Edit these explicit names before loading the addon. Leave localized text empty
-- unless you want to capture selected Blizzard strings for your own local use.
addon.request = {
  cvars = { "nameplateShowEnemies" },
  atlases = { "_AdventuresFrame-Small-Top" },
  symbols = { "CreateFrame", "hooksecurefunc", "issecurevariable", "issecure" },
  globalStrings = {},
}
