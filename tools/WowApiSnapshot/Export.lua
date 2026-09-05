local _, addon = ...
local window
SLASH_WOWAPISNAPSHOT1 = "/wowapisnapshot"
SlashCmdList.WOWAPISNAPSHOT = function()
  local ok, text = pcall(addon.export, addon.request)
  if not ok then
    print("WoW API Snapshot: export failed. Check Request.lua and the selected client.")
    return
  end
  if not window then
    window = CreateFrame("Frame", nil, UIParent, "BasicFrameTemplateWithInset")
    window:SetSize(700, 440)
    window:SetPoint("CENTER")
    window.TitleText:SetText("WoW API Snapshot - copy JSON to a local file")
    local scroll = CreateFrame("ScrollFrame", nil, window, "UIPanelScrollFrameTemplate")
    scroll:SetPoint("TOPLEFT", 16, -40)
    scroll:SetPoint("BOTTOMRIGHT", -32, 16)
    local edit = CreateFrame("EditBox", nil, scroll)
    edit:SetMultiLine(true)
    edit:SetFontObject(ChatFontNormal)
    edit:SetWidth(640)
    edit:SetHeight(360)
    edit:SetMaxLetters(0)
    edit:SetAutoFocus(false)
    edit:SetScript("OnEscapePressed", function() window:Hide() end)
    scroll:SetScrollChild(edit)
    window.edit = edit
  end
  window:Show()
  window.edit:SetText(text)
  window.edit:SetFocus()
  window.edit:HighlightText()
end
