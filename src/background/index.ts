// Minimal background service worker.
// The extension deliberately avoids <all_urls> / persistent content scripts —
// content.js is injected on demand from the side panel via chrome.scripting,
// relying on the activeTab grant obtained when the user opens the panel.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
    console.error("Failed to set side panel behavior", err);
  });
});
