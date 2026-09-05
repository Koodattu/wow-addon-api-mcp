local _, addon = ...
local categories = { "cvars", "atlases", "symbols", "globalStrings" }

local function validate(request)
  for _, category in ipairs(categories) do
    local values = request[category]
    assert(type(values) == "table" and #values <= 2000, "Invalid snapshot request")
    local seen = {}
    for _, name in ipairs(values) do
      assert(type(name) == "string" and #name > 0 and #name <= 200
        and not name:find("[^%w_.:$/%-]") and not seen[name], "Invalid or duplicate resource name")
      if category == "globalStrings" then
        assert(name:match("^[A-Z][A-Z0-9_]*$"), "Localized keys must be explicit uppercase names")
      end
      seen[name] = true
    end
  end
end

local function symbol(name)
  if not name:match("^[%a_][%w_.]*$") or name:find("..", 1, true) or name:sub(-1) == "." then return nil end
  local value = _G
  for part in name:gmatch("[^.]+") do
    if type(value) ~= "table" then return nil end
    value = rawget(value, part)
  end
  if value ~= nil then return { name = name, type = type(value) } end
end

local function cvar(name)
  -- The first return is the current user setting. It is intentionally discarded.
  local _, defaultValue, account, character, locked, secure, readOnly = C_CVar.GetCVarInfo(name)
  if type(defaultValue) ~= "string" then return nil end
  return { name = name, defaultValue = defaultValue, isStoredServerAccount = not not account,
    isStoredServerCharacter = not not character, isLockedFromUser = not not locked,
    isSecure = not not secure, isReadOnly = not not readOnly }
end

local function atlas(name)
  local info = C_Texture.GetAtlasInfo(name)
  if not info then return nil end
  return { name = name, width = info.width, height = info.height,
    leftTexCoord = info.leftTexCoord, rightTexCoord = info.rightTexCoord,
    topTexCoord = info.topTexCoord, bottomTexCoord = info.bottomTexCoord,
    tilesHorizontally = not not info.tilesHorizontally, tilesVertically = not not info.tilesVertically }
end

local function globalString(name)
  local value = rawget(_G, name)
  if type(value) == "string" then return { name = name, value = value } end
end

function addon.collect(request)
  assert(WOW_PROJECT_ID == WOW_PROJECT_MAINLINE, "Use a retail WoW client")
  validate(request)
  local version, build, _, interfaceVersion = GetBuildInfo()
  local result = { schemaVersion = 1,
    source = { kind = "wow-client-observation", channel = "retail", clientVersion = version .. "." .. build,
      locale = GetLocale(), collectorVersion = "1", capturedAt = date("!%Y-%m-%dT%H:%M:%SZ"),
      interfaceVersion = interfaceVersion, projectId = WOW_PROJECT_ID },
    requested = {}, records = {}, failed = {}, missing = {} }
  local readers = { cvars = cvar, atlases = atlas, symbols = symbol, globalStrings = globalString }
  for _, category in ipairs(categories) do
    result.requested[category], result.records[category], result.failed[category], result.missing[category] = {}, {}, {}, {}
    for _, name in ipairs(request[category]) do
      table.insert(result.requested[category], name)
      local ok, record = pcall(readers[category], name)
      if not ok then table.insert(result.failed[category], name)
      elseif record then table.insert(result.records[category], record)
      else table.insert(result.missing[category], name) end
    end
  end
  return result
end

local function quote(value)
  return '"' .. value:gsub('[%z\1-\31\\"]', function(character)
    return string.format("\\u%04x", string.byte(character))
  end) .. '"'
end

local function encode(value, array)
  if type(value) == "string" then return quote(value) end
  if type(value) == "boolean" then return value and "true" or "false" end
  if type(value) == "number" then
    assert(value == value and value ~= math.huge and value ~= -math.huge, "Non-finite snapshot number")
    return tostring(value)
  end
  assert(type(value) == "table", "Unsupported snapshot value")
  local parts = {}
  if array then
    for _, item in ipairs(value) do table.insert(parts, encode(item, false)) end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local keys = {}
  for key in pairs(value) do table.insert(keys, key) end
  table.sort(keys)
  for _, key in ipairs(keys) do
    local isArray = key == "cvars" or key == "atlases" or key == "symbols" or key == "globalStrings"
    table.insert(parts, quote(key) .. ":" .. encode(value[key], isArray))
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

function addon.export(request)
  local json = encode(addon.collect(request), false)
  assert(#json <= 10 * 1024 * 1024, "Snapshot exceeds 10 MB; request fewer names")
  return json
end
