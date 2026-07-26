// activeTab alone is not reliably granted for clicks that happen inside an
// already-open side panel (it's only guaranteed for the click that invokes the
// extension, e.g. the toolbar icon). To make capture actions work reliably
// regardless of how/when the panel was opened, we request the optional host
// permission declared in manifest.json ("<all_urls>") on demand, right when
// the user clicks a capture button.
//
// Important: chrome.tabs.captureVisibleTab() (used for the "区域截图" /
// screenshot capture mode) enforces a *stricter* check than scripting.
// executeScript()/tabs.query() etc: internally it requires either the
// activeTab grant (tab-specific, only refreshed by directly invoking the
// extension action, NOT by clicking buttons inside an already-open side
// panel) OR a host permission pattern whose `match_all_urls()` is true.
// Individual patterns like "http://*/*" or "https://*/*" each cover only one
// scheme and do NOT satisfy that check, even though they're broad enough for
// every other API. Only the literal "<all_urls>" pattern satisfies it, so we
// must request/declare that exact pattern (not the two per-scheme ones) for
// screenshot capture to work reliably.
const OPTIONAL_PATTERNS = ["<all_urls>"];

/**
 * Ensures the extension can access page contents on http(s) sites, requesting
 * the optional host permission if it hasn't been granted yet. Must be called
 * as early as possible inside a click handler (before other awaits) so the
 * browser still recognizes it as a direct response to a user gesture.
 */
export async function ensureHostAccess(): Promise<void> {
  const already = await chrome.permissions.contains({ origins: OPTIONAL_PATTERNS });
  if (already) return;

  const granted = await chrome.permissions.request({ origins: OPTIONAL_PATTERNS });
  if (!granted) {
    throw new Error("需要授权访问网页内容才能抓取，请在弹出的权限提示中点击允许");
  }
}
