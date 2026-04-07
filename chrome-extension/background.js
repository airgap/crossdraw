// Toggle text picker mode when toolbar icon or shortcut is used
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  chrome.tabs.sendMessage(tab.id, { type: 'toggle-picker' })
})
