import { contextPayload, menuItems } from './payload.js';

async function setup() {
  await chrome.contextMenus.removeAll();
  for (const item of menuItems) chrome.contextMenus.create(item);
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(() => { void setup(); });
chrome.runtime.onStartup.addListener(() => { void setup(); });

export function handleContextMenu(info, tab) {
  if (!Number.isInteger(tab?.windowId)) return;
  const payload = contextPayload(info, tab.windowId);
  if (!payload) return;
  // Open synchronously in the context-menu gesture, before awaiting storage.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  void chrome.storage.session.set({ [`pending-${tab.windowId}`]: payload });
}
chrome.contextMenus.onClicked.addListener(handleContextMenu);

chrome.windows.onRemoved.addListener(windowId => { void chrome.storage.session.remove(`pending-${windowId}`); });
